// StepClub API — entra no piugame.com com o login do usuário, lê os recordes e grava no Supabase
// usando o token do próprio usuário (RPC ingest_me). A senha da Pump nunca é gravada.
import http from 'node:http';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { DOMParser } from 'linkedom';
import { lastPage, parseProfile, parseRow, parseTitles, rowsOf, toPayload, isLoginPage } from './piu-parser.js';
import { isSessionAlive, piuLogin, PiuSession, switchSite } from './piu-session.js';
import { refreshCatalog } from './catalog.js';

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jujbkgzkenktjuurrwvo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8_e3UpVPrgDdQbNlFitBvw_9uSoJG_t';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://stepclub.onrender.com,https://pumpstat.onrender.com,http://localhost:5173').split(',');
const SITES = { phoenix2: 'https://piugame.com', phoenix: 'https://phoenix.piugame.com' };
const PAGE_DELAY_MS = 250;
// chave para criptografar a sessão do piugame guardada no Supabase (nunca a senha)
const SESSION_KEY = process.env.SESSION_SECRET ? Buffer.from(process.env.SESSION_SECRET, 'base64') : null;

function seal(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', SESSION_KEY, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function unseal(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', SESSION_KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
}

const jobs = new Map(); // jobId -> { userId, state, message, progress, results, error, at }
const attempts = new Map(); // userId -> [timestamps]
const feedbackSent = new Map(); // userId -> [timestamps]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html');

async function supabaseUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}

async function ingestMe(token, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_me`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_payload: payload, p_source: 'server' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Supabase ${res.status}`);
  return body;
}

async function rpcAsUser(token, fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Supabase ${res.status}`);
  return body;
}

async function scrapeVersion(session, version, job) {
  const get = async (path) => {
    const { html, url } = await session.get(path);
    const doc = parseHtml(html);
    if (isLoginPage(doc, url)) throw new Error('A sessão do piugame expirou durante a leitura.');
    return doc;
  };
  const label = version === 'phoenix' ? 'Phoenix' : 'Phoenix 2';
  job.message = `${label}: lendo perfil…`;
  const profile = parseProfile(await get('/my_page/pumbility.php'));

  const first = await get('/my_page/my_best_score.php');
  const pages = lastPage(first);
  const bests = [];
  const add = (doc) => rowsOf(doc).forEach((r) => { const p = parseRow(r); if (p) bests.push(p); });
  add(first);
  let next = 2; let read = 1;
  const worker = async () => {
    while (next <= pages) {
      const n = next++;
      await sleep(PAGE_DELAY_MS);
      add(await get(`/my_page/my_best_score.php?&&page=${n}`));
      read++;
      job.message = `${label}: recordes ${read}/${pages} páginas`;
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  job.message = `${label}: jogadas recentes…`;
  const plays = rowsOf(await get('/my_page/recently_played.php')).map(parseRow).filter(Boolean);
  job.message = `${label}: títulos…`;
  let titles = [];
  try { titles = parseTitles(await get('/my_page/title.php')); } catch { /* títulos são opcionais */ }
  return { ...toPayload(version, profile, bests, plays), titles };
}

// grava os dados: com o token do usuário (sincronização manual) ou com a chave do servidor (automática)
const userWriter = (token) => ({
  scores: (payload) => ingestMe(token, payload),
  titles: (version, titles) => rpcAsUser(token, 'ingest_titles_me', { p_version: version, p_titles: titles }),
  session: (blob) => rpcAsUser(token, 'save_piu_session', { p_blob: blob }),
});
const serverWriter = (userId) => ({
  scores: (payload) => rpcAsServer('ingest_auto', { p_user: userId, p_payload: payload }),
  titles: (version, titles) => rpcAsServer('ingest_titles_auto', { p_user: userId, p_version: version, p_titles: titles }),
  session: null, // a sessão renovada é gravada em auto_sync_done
});

async function rpcAsServer(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: process.env.INGEST_KEY, ...args }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Supabase ${res.status}`);
  return body;
}

async function runJob(job, { login, password, versions, token, saved, writer = userWriter(token) }) {
  try {
    let session;
    if (saved) {
      job.message = 'Usando a sessão salva do piugame…';
      session = PiuSession.fromJSON(saved);
      session.base = SITES.phoenix2;
      if (!(await isSessionAlive(session))) {
        job.needLogin = true;
        throw new Error('A sessão do piugame expirou. Entre de novo com a sua senha AM.PASS.');
      }
    } else {
      job.message = 'Entrando no piugame.com…';
      session = await piuLogin(login, password);
    }
    for (const version of versions) {
      const label = version === 'phoenix' ? 'Phoenix' : 'Phoenix 2';
      job.message = `${label}: abrindo a sessão…`;
      await switchSite(session, SITES[version]);
      const payload = await scrapeVersion(session, version, job);
      job.message = `${label}: gravando ${payload.bests.length} recordes…`;
      const { titles, ...scores } = payload;
      job.results[version] = { ...(await writer.scores(scores)), bests: payload.bests.length, plays: payload.plays.length };
      if (titles.length) job.results[version].titles = await writer.titles(version, titles);
      job.progress = Object.keys(job.results).length / versions.length;
    }
    job.session = session;
    if (SESSION_KEY && writer.session) {
      try { session.base = SITES.phoenix2; await writer.session(seal(session.toJSON())); } catch { /* opcional */ }
    }
    job.state = 'done';
    job.message = 'Pronto!';
  } catch (e) {
    job.state = 'error';
    job.error = e.message || String(e);
    job.message = job.error;
  } finally {
    job.at = Date.now();
  }
}

// ---------- HTTP ----------
function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json', Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  }
  res.writeHead(status, headers);
  res.end(body == null ? '' : JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10_000) throw new Error('payload grande demais'); }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') return send(res, 204, null, origin);
    if (url.pathname === '/health') return send(res, 200, { ok: true }, origin);
    // o app chama isto ao abrir; no máximo uma atualização do catálogo por dia
    if (url.pathname === '/api/catalog/tick') { catalogTick(); autoSyncTick(); return send(res, 202, { ok: true }, origin); }
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const user = token ? await supabaseUser(token) : null;
    if (!user?.id) return send(res, 401, { error: 'Faça login no StepClub.' }, origin);

    if (req.method === 'POST' && url.pathname === '/api/piu/sync') {
      const { login, password, versions, useSaved } = await readJson(req);
      let saved = null;
      if (useSaved) {
        if (!SESSION_KEY) return send(res, 400, { error: 'Sincronização rápida indisponível.', needLogin: true }, origin);
        try {
          const blob = await rpcAsUser(token, 'my_piu_session', {});
          if (blob) saved = unseal(blob);
        } catch { /* sem sessão */ }
        if (!saved) return send(res, 401, { error: 'Entre com a sua conta AM.PASS uma vez para ativar a sincronização rápida.', needLogin: true }, origin);
      } else if (!login || !password) return send(res, 400, { error: 'Informe o login e a senha da Pump It Up.' }, origin);
      const vs = (Array.isArray(versions) && versions.length ? versions : ['phoenix2', 'phoenix']).filter((v) => SITES[v]);
      // limites: 1 sincronização a cada 2 min por conta e no máximo 5 tentativas por 15 min (evita bloquear a conta AM.PASS)
      const now = Date.now();
      const hist = (attempts.get(user.id) || []).filter((t) => now - t < 15 * 60_000);
      const lastOk = [...jobs.values()].filter((j) => j.userId === user.id && j.state === 'done').reduce((m, j) => Math.max(m, j.at), 0);
      if (hist.length >= 5) return send(res, 429, { error: 'Muitas tentativas. Espere alguns minutos e tente de novo.' }, origin);
      if (now - lastOk < 2 * 60_000) return send(res, 429, { error: 'Você acabou de sincronizar. Tente de novo em 2 minutos.' }, origin);
      attempts.set(user.id, [...hist, now]);
      const running = [...jobs.values()].find((j) => j.userId === user.id && j.state === 'running');
      if (running) return send(res, 409, { error: 'Já existe uma sincronização em andamento.', jobId: running.id }, origin);
      const job = { id: randomUUID(), userId: user.id, state: 'running', message: 'Começando…', progress: 0, results: {}, at: Date.now() };
      jobs.set(job.id, job);
      runJob(job, { login: String(login || '').trim(), password: String(password || ''), versions: vs, token, saved });
      return send(res, 202, { jobId: job.id }, origin);
    }

    // ajuda/feedback: a mensagem já foi salva no Supabase; aqui só avisamos o suporte por e-mail.
    // FEEDBACK_WEBHOOK é o app da Web do Apps Script "StepClub Suporte" (na conta Google do dono), que envia o e-mail.
    // FEEDBACK_TOKEN é o segredo que o script confere antes de enviar.
    if (req.method === 'POST' && url.pathname === '/api/feedback') {
      const hook = process.env.FEEDBACK_WEBHOOK;
      if (!hook) return send(res, 202, { emailed: false }, origin);
      const now = Date.now();
      const sent = (feedbackSent.get(user.id) || []).filter((x) => now - x < 3600_000);
      if (sent.length >= 5) return send(res, 429, { error: 'muitas mensagens na última hora. Tente mais tarde' }, origin);
      feedbackSent.set(user.id, [...sent, now]);
      const { id, kind, message, contact, meta } = await readJson(req);
      const label = { question: 'Dúvida', bug: 'Problema', idea: 'Sugestão', other: 'Outro' }[kind] || 'Mensagem';
      const m2 = meta && typeof meta === 'object' ? meta : {};
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://stepclub.onrender.com', Referer: 'https://stepclub.onrender.com/' },
        body: JSON.stringify({
          _token: process.env.FEEDBACK_TOKEN || '',
          _subject: `StepClub · ${label} #${Number(id) || ''}`, _template: 'table', _captcha: 'false',
          _replyto: String(contact || user.email || ''),
          Tipo: label, Mensagem: String(message || '').slice(0, 2000), 'Responder para': String(contact || '—'),
          Conta: user.email || user.id, 'ID no banco': Number(id) || '—',
          Tela: m2.page || '—', Idioma: m2.lang || '—', 'Versão do jogo': m2.version || '—',
          Aparelho: m2.ua || '—', 'Tamanho da tela': m2.screen || '—', Build: m2.build || '—',
        }),
      }).catch(() => null);
      const body = r && r.ok ? await r.json().catch(() => ({})) : null;
      const ok = !!body && body.ok !== false;
      if (ok && id) await rpcAsUser(token, 'feedback_emailed', { p_id: Number(id) }).catch(() => {});
      return send(res, 200, { emailed: ok }, origin);
    }

    const m = url.pathname.match(/^\/api\/piu\/jobs\/([\w-]+)$/);
    if (req.method === 'GET' && m) {
      const job = jobs.get(m[1]);
      if (!job || job.userId !== user.id) return send(res, 404, { error: 'Sincronização não encontrada.' }, origin);
      const { userId, ...pub } = job;
      return send(res, 200, pub, origin);
    }
    return send(res, 404, { error: 'not found' }, origin);
  } catch (e) {
    return send(res, 500, { error: e.message, cause: e.cause?.code || e.cause?.message }, origin);
  }
});

// ---------- sincronização automática (quem tem sessão salva; Pro quando a cobrança estiver ativa) ----------
let autoBusy = false;
async function autoSyncTick() {
  if (autoBusy || !process.env.INGEST_KEY || !SESSION_KEY) return;
  autoBusy = true;
  try {
    const list = await rpcAsServer('auto_sync_candidates', { p_limit: 4, p_hours: 6 });
    for (const c of list) {
      let saved = null;
      try { saved = unseal(c.blob); } catch { await rpcAsServer('auto_sync_done', { p_user: c.user, p_blob: null, p_error: 'session_expired' }).catch(() => {}); continue; }
      const job = { id: `auto-${c.user}`, userId: c.user, state: 'running', message: '', progress: 0, results: {}, at: Date.now() };
      await runJob(job, { versions: ['phoenix2', 'phoenix'], saved, writer: serverWriter(c.user) });
      let blob = null;
      if (job.state === 'done' && job.session) { try { job.session.base = SITES.phoenix2; blob = seal(job.session.toJSON()); } catch { /* ignora */ } }
      const error = job.state === 'done' ? null : (job.needLogin ? 'session_expired' : job.error);
      await rpcAsServer('auto_sync_done', { p_user: c.user, p_blob: blob, p_error: error }).catch(() => {});
      console.log('auto-sync', c.user.slice(0, 8), job.state, error || '');
      await sleep(5000); // devagar com o piugame
    }
  } catch (e) {
    console.error('auto-sync:', e.message);
  } finally {
    autoBusy = false;
  }
}
setTimeout(autoSyncTick, 60_000).unref();
setInterval(autoSyncTick, 15 * 60_000).unref();

let catalogBusy = false;
function catalogTick() {
  if (catalogBusy || !process.env.INGEST_KEY) return;
  catalogBusy = true;
  refreshCatalog({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, ingestKey: process.env.INGEST_KEY })
    .catch((e) => console.error('catálogo:', e.message))
    .finally(() => { catalogBusy = false; });
}
setTimeout(catalogTick, 30_000).unref();
setInterval(catalogTick, 6 * 3600_000).unref();

// limpa jobs antigos
setInterval(() => { const lim = Date.now() - 30 * 60_000; for (const [id, j] of jobs) if (j.state !== 'running' && j.at < lim) jobs.delete(id); }, 60_000).unref();

server.listen(PORT, () => console.log(`StepClub API na porta ${PORT}`));

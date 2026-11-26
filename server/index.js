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

async function runJob(job, { login, password, versions, token, saved }) {
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
      job.results[version] = { ...(await ingestMe(token, scores)), bests: payload.bests.length, plays: payload.plays.length };
      if (titles.length) job.results[version].titles = await rpcAsUser(token, 'ingest_titles_me', { p_version: version, p_titles: titles });
      job.progress = Object.keys(job.results).length / versions.length;
    }
    if (SESSION_KEY) {
      try { session.base = SITES.phoenix2; await rpcAsUser(token, 'save_piu_session', { p_blob: seal(session.toJSON()) }); } catch { /* opcional */ }
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
    if (url.pathname === '/api/catalog/tick') { catalogTick(); return send(res, 202, { ok: true }, origin); }
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

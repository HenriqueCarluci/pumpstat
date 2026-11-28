// PIU Stats API — entra no piugame.com com o login do usuário, lê os recordes e grava no Supabase
// usando o token do próprio usuário (RPC ingest_me). A senha da Pump nunca é gravada.
import http from 'node:http';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DOMParser } from 'linkedom';
import { lastPage, parseProfile, parseRow, parseTitles, rowsOf, toPayload, isLoginPage } from './piu-parser.js';
import { getDispatcher, isSessionAlive, piuLogin, PiuSession, switchSite } from './piu-session.js';
import { normNick, parseAccounts, switchTo } from './piu-accounts.js';
import { resolveVideo, searchUrl } from './videos.js';
import { refreshCatalog } from './catalog.js';
import { queuePush } from './push.js';
import sharp from 'sharp';

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jujbkgzkenktjuurrwvo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8_e3UpVPrgDdQbNlFitBvw_9uSoJG_t';
const ALLOWED_ORIGINS = [...new Set([
  ...(process.env.ALLOWED_ORIGINS || 'https://stepclub.onrender.com,https://pumpstat.onrender.com,http://localhost:5173').split(','),
  'https://piustats.com.br', 'https://www.piustats.com.br', 'https://stepclub.onrender.com',
].map((o) => o.trim()).filter(Boolean))];
const SITES = { phoenix2: 'https://piugame.com', phoenix: 'https://phoenix.piugame.com' };
const PAGE_DELAY_MS = 250;
// chave para criptografar a sessão do piugame e o login AM.PASS guardados no Supabase (AES-256-GCM; a chave só existe aqui)
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

const jwtAal = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).aal || 'aal1'; } catch { return 'aal1'; } };

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

async function scrapeVersion(session, version, job, partial = false) {
  const get = async (path) => {
    const { html, url } = await session.get(path);
    const doc = parseHtml(html);
    if (isLoginPage(doc, url)) throw new Error('A sessão do piugame expirou durante a leitura.');
    return doc;
  };
  const label = version === 'phoenix' ? 'Phoenix' : 'Phoenix 2';
  job.message = `${label}: lendo perfil…`;
  const profile = parseProfile(await get('/my_page/pumbility.php'));
  if (partial) {
    // atualização rápida: só o perfil e as jogadas recentes (o banco sobe o recorde quando uma jogada passa dele)
    job.message = `${label}: jogadas recentes…`;
    const recent = rowsOf(await get('/my_page/recently_played.php')).map(parseRow).filter(Boolean);
    return { ...toPayload(version, profile, [], recent), partial: true, titles: [] };
  }

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
  cred: (blob) => rpcAsUser(token, 'save_piu_cred', { p_blob: blob }),
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

// guarda (uma vez por conta, no máximo) o HTML da janela "Switch Account" para ajustarmos a leitura dela
const sampled = new Set();
function sampleAccounts(userId, modal, accounts, extra = {}) {
  if (!process.env.INGEST_KEY || !modal) return;
  const key = `${userId}:${extra.reason || 'list'}`;
  if (sampled.has(key)) return;
  sampled.add(key);
  rpcAsServer('save_piu_sample', { p_kind: 'switch_account', p_info: { accounts: accounts.map(({ el, ...a }) => a), ...extra }, p_html: modal.outerHTML })
    .catch((e) => console.warn('sample', e.message));
}

/**
 * Conta AM.PASS com mais de um ID de jogo: pergunta qual usar (só na sincronização manual) e troca para ele.
 * Sem escolha possível (sincronização automática sem preferência), segue com a conta que o site já deixou ativa.
 */
async function pickAccount(session, job, version) {
  const getDoc = async (path) => { const r = await session.get(path); return { doc: parseHtml(r.html), html: r.html }; };
  const { doc } = await getDoc('/my_page/play_data.php');
  const { modal, accounts } = parseAccounts(doc);
  if (accounts.length < 2) return;
  sampleAccounts(job.userId, modal, accounts);
  if (!job.account) {
    if (!job.interactive) return;
    job.accounts = accounts.map(({ el, ...a }) => a);
    job.state = 'choose';
    job.message = 'Sua conta tem mais de um ID de jogo. Escolha qual vincular.';
    job.account = await new Promise((resolve, reject) => {
      job.choose = resolve;
      setTimeout(() => reject(new Error('Tempo esgotado para escolher a conta. Sincronize de novo.')), 5 * 60_000).unref();
    });
    delete job.choose; delete job.accounts;
    job.state = 'running';
  }
  const label = version === 'phoenix' ? 'Phoenix' : 'Phoenix 2';
  job.message = `${label}: trocando para ${job.account}…`;
  let done;
  try { done = await switchTo(session, getDoc, job.account); } catch (e) {
    sampleAccounts(job.userId, modal, accounts, { reason: 'switch_failed', error: e.code || e.message, want: job.account });
    throw new Error('Não consegui trocar de conta automaticamente. Troque a conta em piugame.com (Switch Account) e sincronize de novo; já avisamos o suporte.');
  }
  if (!done) return; // esse ID não existe nesta versão
  const now = normNick(parseProfile((await getDoc('/my_page/pumbility.php')).doc).nickname);
  if (now !== normNick(job.account)) {
    sampleAccounts(job.userId, modal, accounts, { reason: 'switch_unverified', want: job.account, got: now });
    throw new Error('Não consegui trocar de conta automaticamente. Troque a conta em piugame.com (Switch Account) e sincronize de novo; já avisamos o suporte.');
  }
}

/**
 * Regras do vínculo antes de gravar: o ID de jogo não pode estar em outra conta do app, e trocar de ID
 * numa conta que já tem notas pergunta se é o mesmo jogador (mudou o nick) ou outro (apaga as notas antigas).
 * Na sincronização automática não há a quem perguntar: para sem gravar.
 */
async function checkLink(job, nickname) {
  if (job.linkChecked || !nickname || !process.env.INGEST_KEY) return;
  const st = await rpcAsServer('piu_link_check', { p_user: job.userId, p_game_id: nickname });
  if (st.taken || st.changed) {
    if (!job.interactive) {
      job.needLogin = true;
      throw new Error(st.taken ? 'Este ID de jogo também está vinculado a outra conta do PIU Stats. Entre com a sua senha AM.PASS para decidir onde ele fica.' : 'O ID de jogo desta conta mudou. Entre com a sua senha AM.PASS para confirmar.');
    }
    job.link = { game_id: nickname, current: st.current || null, taken: !!st.taken, changed: !!st.changed };
    job.state = 'confirm';
    job.message = 'Confirme o vínculo com a conta Pump It Up.';
    const d = await new Promise((resolve, reject) => {
      job.confirm = resolve;
      setTimeout(() => reject(new Error('Tempo esgotado para confirmar. Sincronize de novo.')), 10 * 60_000).unref();
    });
    delete job.confirm; delete job.link;
    if (!d || d.cancel) throw new Error('Sincronização cancelada. Nada foi gravado.');
    if (st.taken && !d.move) throw new Error('Sincronização cancelada. Nada foi gravado.');
    if (st.changed && !['same', 'other'].includes(d.mode)) throw new Error('Sincronização cancelada. Nada foi gravado.');
    job.state = 'running';
    job.message = 'Atualizando o vínculo…';
    await rpcAsServer('piu_link_resolve', { p_user: job.userId, p_game_id: nickname, p_mode: st.changed ? d.mode : null, p_move: !!st.taken });
  }
  job.linkChecked = true;
}

// login guardado (cifrado): entra de novo quando a sessão expirou; senha recusada → o login guardado é apagado
async function credLogin(job, cred) {
  job.message = 'Entrando no piugame.com…';
  if (!job.account && cred.account) job.account = cred.account;
  try { return await piuLogin(cred.login, cred.password); } catch (e) {
    if (/^piugame:|incorretos/i.test(e.message || '')) job.credBad = true;
    job.needLogin = true;
    throw e;
  }
}

async function runJob(job, { login, password, versions, token, saved, cred, partial = false, writer = userWriter(token) }) {
  try {
    let session;
    if (saved) {
      job.message = 'Usando a sessão salva do piugame…';
      session = PiuSession.fromJSON(saved);
      session.base = SITES.phoenix2;
      if (!(await isSessionAlive(session))) {
        if (!cred) {
          job.needLogin = true;
          throw new Error('A sessão do piugame expirou. Entre de novo com a sua senha AM.PASS.');
        }
        session = await credLogin(job, cred);
        partial = false;
      }
    } else if (login) {
      job.message = 'Entrando no piugame.com…';
      session = await piuLogin(login, password);
    } else if (cred) {
      session = await credLogin(job, cred);
    } else {
      job.needLogin = true;
      throw new Error('Entre com a sua conta AM.PASS para sincronizar.');
    }
    for (const version of versions) {
      const label = version === 'phoenix' ? 'Phoenix' : 'Phoenix 2';
      job.message = `${label}: abrindo a sessão…`;
      await switchSite(session, SITES[version]);
      await pickAccount(session, job, version);
      const payload = await scrapeVersion(session, version, job, partial);
      await checkLink(job, payload.profile?.nickname);
      job.message = `${label}: gravando ${payload.bests.length} recordes…`;
      const { titles, ...scores } = payload;
      job.results[version] = { ...(await writer.scores(scores)), bests: payload.bests.length, plays: payload.plays.length };
      if (titles.length) job.results[version].titles = await writer.titles(version, titles);
      job.progress = Object.keys(job.results).length / versions.length;
    }
    if (job.account) session.account = job.account;
    job.session = session;
    if (SESSION_KEY && writer.session) {
      try { session.base = SITES.phoenix2; await writer.session(seal(session.toJSON())); } catch { /* opcional */ }
    }
    // login digitado agora: guarda cifrado para entrar de novo quando a sessão expirar (política de privacidade)
    if (SESSION_KEY && writer.cred && login && password) {
      try { await writer.cred(seal({ login, password, account: job.account || null })); } catch { /* opcional */ }
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


// ---------- repasse de imagens (capas) ----------
const IMG_HOSTS = new Set(['piugame.com', 'phoenix.piugame.com', 'www.piugame.com', 'piuimages.arroweclip.se', 'piustats.com.br']);
const imgCache = new Map(); // url -> { type, buf, at }
// ?w=: devolve a imagem reduzida (WebP) para o app gastar menos dados e espaço (as capas originais têm ~330 KB)
async function proxyImage(raw, wRaw) {
  const w = Math.max(0, Math.min(960, Math.round(Number(wRaw) || 0)));
  let u;
  try { u = new URL(String(raw || '')); } catch { return [400, { 'Content-Type': 'text/plain' }, 'url inválida']; }
  if (u.protocol !== 'https:' || !IMG_HOSTS.has(u.hostname)) return [403, { 'Content-Type': 'text/plain' }, 'host não permitido'];
  const src = u.toString();
  const key = w >= 48 ? `${src}#w${w}` : src;
  let hit = imgCache.get(key);
  if (!hit) {
    const dispatcher = u.hostname.endsWith('piugame.com') ? await getDispatcher().catch(() => undefined) : undefined;
    const r = await fetch(src, {
      dispatcher,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
        Referer: `${u.protocol}//${u.hostname}/`,
      },
    }).catch((e) => { console.warn('img fetch', key, e?.cause?.code || e?.message); return null; });
    const type = r?.headers.get('content-type') || '';
    if (!r || !r.ok || !/^image\//.test(type)) {
      if (r) console.warn('img fail', key, r.status, type);
      return [502, { 'Content-Type': 'text/plain' }, 'imagem indisponível'];
    }
    let buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3_000_000) return [413, { 'Content-Type': 'text/plain' }, 'imagem grande demais'];
    let outType = type;
    if (w >= 48 && /^image\/(png|jpe?g|webp)$/.test(type)) {
      try {
        buf = await sharp(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
        outType = 'image/webp';
      } catch (e) { console.warn('img resize', src, e?.message); }
    }
    hit = { type: outType, buf };
    imgCache.set(key, hit);
    if (imgCache.size > 600) imgCache.delete(imgCache.keys().next().value);
  }
  return [200, { 'Content-Type': hit.type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=604800, immutable', 'Cross-Origin-Resource-Policy': 'cross-origin' }, hit.buf];
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

const videoHits = new Map();

// Webhook do RevenueCat (assinaturas da Google Play). O cabeçalho Authorization tem de ser igual a
// REVENUECAT_WEBHOOK_AUTH (o mesmo valor configurado no painel do RevenueCat).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sameSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
async function revenueCatWebhook(req) {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret || !process.env.INGEST_KEY) return [503, { error: 'cobrança não configurada' }];
  if (!sameSecret(req.headers.authorization, secret)) return [401, { error: 'não autorizado' }];
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) return [413, { error: 'payload grande demais' }]; }
  const ev = (raw ? JSON.parse(raw) : {}).event || {};
  // o app identifica o usuário pelo id da conta; ids anônimos do RevenueCat são ignorados
  const user = [ev.app_user_id, ...(ev.aliases || [])].find((id) => UUID_RE.test(String(id || '')));
  const out = await rpcAsServer('billing_event', {
    p_event_id: ev.id ? String(ev.id) : null,
    p_user: user || null,
    p_type: String(ev.type || '?'),
    p_product: ev.new_product_id || ev.product_id || null,
    p_expires: ev.expiration_at_ms ? new Date(Number(ev.expiration_at_ms)).toISOString() : null,
    p_payload: { type: ev.type, store: ev.store, environment: ev.environment, period: ev.period_type, price: ev.price, currency: ev.currency },
  });
  return [200, out];
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') return send(res, 204, null, origin);
    if (req.method === 'POST' && url.pathname === '/api/billing/revenuecat') {
      const [code, body] = await revenueCatWebhook(req);
      return send(res, code, body, origin);
    }
    if (url.pathname === '/health') return send(res, 200, { ok: true }, origin);
    // o app chama isto ao abrir; no máximo uma atualização do catálogo por dia
    // a fila mudou (aviso do banco) ou o app pediu: manda os avisos de "sua vez"; não recebe dados
    if (req.method === 'POST' && url.pathname === '/api/push/queue-tick') { push.tick(); return send(res, 202, { ok: true }, origin); }
    if (url.pathname === '/api/catalog/tick') { catalogTick(); autoSyncTick(); return send(res, 202, { ok: true }, origin); }
    if (req.method === 'POST' && url.pathname === '/api/sync/tick') { autoSyncTick(); return send(res, 202, { ok: true }, origin); }
    // link do YouTube: abre direto o vídeo do chart (c) ou da música (s); público, para funcionar num link comum
    const vm = url.pathname.match(/^\/api\/video\/([cs])\/(\d{1,9})$/);
    if (req.method === 'GET' && vm) {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
      const now = Date.now();
      const hits = (videoHits.get(ip) || []).filter((x) => now - x < 60_000);
      videoHits.set(ip, [...hits, now]);
      let target = null;
      if (hits.length < 40 && process.env.INGEST_KEY) {
        target = await resolveVideo({ kind: vm[1], id: Number(vm[2]), rpc: rpcAsServer }).catch((e) => { console.log('video', e.message); return null; });
      }
      // se algo falhar, abre a mesma busca que o app montou (q)
      const q = (url.searchParams.get('q') || 'pump it up').slice(0, 120);
      res.writeHead(302, { Location: target || searchUrl(q), 'Cache-Control': 'no-store' });
      return res.end();
    }
    // capas e grades da Pump para o app desenhar no canvas (imagem do dia): só destes servidores, com CORS liberado
    if (req.method === 'GET' && url.pathname === '/api/img') {
      const [code, headers, body] = await proxyImage(url.searchParams.get('u'), url.searchParams.get('w'));
      res.writeHead(code, headers);
      return res.end(body);
    }
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const user = token ? await supabaseUser(token) : null;
    if (!user?.id) return send(res, 401, { error: 'Faça login no PIU Stats.' }, origin);
    // verificação em duas etapas: quem cadastrou o autenticador precisa ter confirmado o código nesta sessão
    if ((user.factors || []).some((f) => f.status === 'verified') && jwtAal(token) !== 'aal2') {
      return send(res, 403, { error: 'Confirme o código do autenticador para continuar.', code: 'mfa_required' }, origin);
    }

    if (req.method === 'POST' && url.pathname === '/api/piu/sync') {
      const { login, password, versions, useSaved, partial, account } = await readJson(req);
      let saved = null;
      let cred = null;
      if (useSaved) {
        if (!SESSION_KEY) return send(res, 400, { error: 'Sincronização rápida indisponível.', needLogin: true }, origin);
        try {
          const blob = await rpcAsUser(token, 'my_piu_session', {});
          if (blob) saved = unseal(blob);
        } catch { /* sem sessão */ }
        try {
          const cb = process.env.INGEST_KEY ? await rpcAsServer('piu_cred_get', { p_user: user.id }) : null;
          if (cb) cred = unseal(cb);
        } catch { /* sem login guardado */ }
        if (!saved && !cred) return send(res, 401, { error: 'Entre com a sua conta AM.PASS uma vez para ativar a sincronização rápida.', needLogin: true }, origin);
      } else if (!login || !password) return send(res, 400, { error: 'Informe o login e a senha da Pump It Up.' }, origin);
      const vs = (Array.isArray(versions) && versions.length ? versions : ['phoenix2', 'phoenix']).filter((v) => SITES[v]);
      // limites: 1 sincronização a cada 2 min por conta e no máximo 5 tentativas por 15 min (evita bloquear a conta AM.PASS)
      const now = Date.now();
      const hist = (attempts.get(user.id) || []).filter((t) => now - t < 15 * 60_000);
      const lastOk = [...jobs.values()].filter((j) => j.userId === user.id && j.state === 'done').reduce((m, j) => Math.max(m, j.at), 0);
      if (hist.length >= 5) return send(res, 429, { error: 'Muitas tentativas. Espere alguns minutos e tente de novo.' }, origin);
      if (now - lastOk < (partial ? 45_000 : 2 * 60_000)) return send(res, 429, { error: partial ? 'Você acabou de atualizar. Tente de novo em 1 minuto.' : 'Você acabou de sincronizar. Tente de novo em 2 minutos.' }, origin);
      attempts.set(user.id, [...hist, now]);
      const running = [...jobs.values()].find((j) => j.userId === user.id && j.state === 'running');
      if (running) return send(res, 409, { error: 'Já existe uma sincronização em andamento.', jobId: running.id }, origin);
      const job = { id: randomUUID(), userId: user.id, state: 'running', message: 'Começando…', progress: 0, results: {}, at: Date.now(),
        interactive: !saved && !cred, account: account ? String(account).slice(0, 40) : (saved?.account || null) };
      jobs.set(job.id, job);
      runJob(job, { login: useSaved ? '' : String(login || '').trim(), password: useSaved ? '' : String(password || ''), versions: vs, token, saved, cred, partial: !!partial && !!saved })
        .then(() => { if (job.credBad) rpcAsServer('piu_cred_drop', { p_user: user.id }).catch(() => {}); });
      return send(res, 202, { jobId: job.id }, origin);
    }

    // ajuda/feedback: a mensagem já foi salva no Supabase; aqui só avisamos o suporte por e-mail.
    // FEEDBACK_WEBHOOK é o app da Web do Apps Script "PIU Stats Suporte" (na conta Google do dono), que envia o e-mail.
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
          _subject: `PIU Stats · ${label} #${Number(id) || ''}`, _template: 'table', _captcha: 'false',
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

    // pedido de time novo: avisa o admin por e-mail com o logo e as redes (o pedido já está salvo e aparece no painel)
    if (req.method === 'POST' && url.pathname === '/api/team-request') {
      const hook = process.env.FEEDBACK_WEBHOOK;
      if (!hook) return send(res, 202, { emailed: false }, origin);
      const { id } = await readJson(req);
      const tr = await rpcAsUser(token, 'team_request_mail', { p_id: Number(id) || 0 }).catch(() => null);
      if (!tr) return send(res, 200, { emailed: false }, origin);
      const soc = tr.socials && typeof tr.socials === 'object' ? tr.socials : {};
      const links = {
        tiktok: (h) => `https://tiktok.com/@${h}`, youtube: (h) => `https://youtube.com/@${h}`, twitch: (h) => `https://twitch.tv/${h}`,
        x: (h) => `https://x.com/${h}`, discord: (h) => `https://discord.gg/${h}`,
      };
      const redes = Object.entries(links).filter(([k]) => soc[k]).map(([k, f]) => f(String(soc[k]))).join('\n') || '—';
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://stepclub.onrender.com', Referer: 'https://stepclub.onrender.com/' },
        body: JSON.stringify({
          _token: process.env.FEEDBACK_TOKEN || '',
          _subject: `PIU Stats · Pedido de time: ${String(tr.name || '').slice(0, 40)}`, _template: 'table', _captcha: 'false',
          _replyto: String(user.email || ''),
          Tipo: 'Pedido de time', Time: String(tr.name || ''), Sigla: tr.tag || '—', Cidade: tr.city || '—',
          Logo: tr.logo || 'sem logo',
          Instagram: tr.instagram ? `https://instagram.com/${tr.instagram}` : '—', 'Outras redes': redes,
          'Sobre o time': String(tr.about || '—').slice(0, 500), Contato: String(tr.contact || '—').slice(0, 120),
          'Pedido por': tr.nickname || '—', Conta: user.email || user.id, 'ID do pedido': Number(tr.id) || '—',
          Aprovar: 'https://piustats.com.br/#/admin?tab=approvals',
          ...(tr.logo ? { _attachments: [{ name: `logo-${Number(tr.id) || 'time'}.${String(tr.logo).split('.').pop()}`, url: tr.logo }] } : {}),
        }),
      }).catch(() => null);
      const body = r && r.ok ? await r.json().catch(() => ({})) : null;
      return send(res, 200, { emailed: !!body && body.ok !== false }, origin);
    }

    // vínculo: o app manda a decisão (mesmo jogador / outro jogador / mover de outra conta / cancelar)
    const mf = url.pathname.match(/^\/api\/piu\/jobs\/([\w-]+)\/confirm$/);
    if (req.method === 'POST' && mf) {
      const job = jobs.get(mf[1]);
      if (!job || job.userId !== user.id) return send(res, 404, { error: 'Sincronização não encontrada.' }, origin);
      if (job.state !== 'confirm' || !job.confirm) return send(res, 409, { error: 'Essa escolha não vale mais. Sincronize de novo.' }, origin);
      const { mode, move, cancel } = await readJson(req);
      job.state = 'running'; job.message = cancel ? 'Cancelando…' : 'Atualizando o vínculo…';
      job.confirm({ mode: mode === 'same' || mode === 'other' ? mode : null, move: !!move, cancel: !!cancel });
      return send(res, 200, { ok: true }, origin);
    }
    // conta com mais de um ID de jogo: o app manda o nick escolhido e a sincronização continua
    const mc = url.pathname.match(/^\/api\/piu\/jobs\/([\w-]+)\/choose$/);
    if (req.method === 'POST' && mc) {
      const job = jobs.get(mc[1]);
      if (!job || job.userId !== user.id) return send(res, 404, { error: 'Sincronização não encontrada.' }, origin);
      const { account } = await readJson(req);
      const ok = job.state === 'choose' && job.choose && (job.accounts || []).some((a) => a.nickname === account);
      if (!ok) return send(res, 409, { error: 'Essa escolha não vale mais. Sincronize de novo.' }, origin);
      job.state = 'running'; job.message = 'Trocando de conta…';
      job.choose(account);
      return send(res, 200, { ok: true }, origin);
    }
    const m = url.pathname.match(/^\/api\/piu\/jobs\/([\w-]+)$/);
    if (req.method === 'GET' && m) {
      const job = jobs.get(m[1]);
      if (!job || job.userId !== user.id) return send(res, 404, { error: 'Sincronização não encontrada.' }, origin);
      const { userId, choose, confirm, session, interactive, linkChecked, ...pub } = job;
      return send(res, 200, pub, origin);
    }
    return send(res, 404, { error: 'not found' }, origin);
  } catch (e) {
    return send(res, 500, { error: e.message, cause: e.cause?.code || e.cause?.message }, origin);
  }
});

// ---------- sincronização automática (quem tem sessão salva; Pro quando a cobrança estiver ativa) ----------
// e a fila do admin (Admin → Atualizar notas), que usa a mesma sessão salva. Um de cada vez, devagar com o piugame.
let autoBusy = false;

/** Atualiza as notas de uma pessoa com a sessão salva ou, se ela expirou, com o login guardado. Devolve null (ok) ou o erro. */
async function syncSaved(userId, blob, credBlob) {
  let saved = null;
  let cred = null;
  if (blob) { try { saved = unseal(blob); } catch { /* sessão ilegível */ } }
  if (credBlob) { try { cred = unseal(credBlob); } catch { await rpcAsServer('piu_cred_drop', { p_user: userId }).catch(() => {}); } }
  if (!saved && !cred) {
    await rpcAsServer('auto_sync_done', { p_user: userId, p_blob: null, p_error: 'session_expired' }).catch(() => {});
    return 'session_expired';
  }
  const job = { id: `auto-${userId}`, userId, state: 'running', message: '', progress: 0, results: {}, at: Date.now(), account: saved?.account || cred?.account || null };
  await runJob(job, { versions: ['phoenix2', 'phoenix'], saved, cred, writer: serverWriter(userId) });
  if (job.credBad) await rpcAsServer('piu_cred_drop', { p_user: userId }).catch(() => {});
  if (job.state === 'done' && job.session) {
    try { job.session.base = SITES.phoenix2; await rpcAsServer('piu_session_store', { p_user: userId, p_blob: seal(job.session.toJSON()) }); } catch { /* ignora */ }
  }
  const error = job.state === 'done' ? null : (job.needLogin ? 'session_expired' : job.error);
  await rpcAsServer('auto_sync_done', { p_user: userId, p_blob: null, p_error: error }).catch(() => {});
  return error;
}

async function autoSyncTick() {
  if (autoBusy || !process.env.INGEST_KEY || !SESSION_KEY) return;
  autoBusy = true;
  try {
    // primeiro a fila do admin, até esvaziar
    for (let round = 0; round < 50; round++) {
      const reqs = await rpcAsServer('admin_sync_take', { p_limit: 3 });
      if (!reqs.length) break;
      for (const r of reqs) {
        let error = null;
        if (!r.blob && !r.cred) error = 'sem sessão salva';
        else { try { error = await syncSaved(r.user, r.blob, r.cred); } catch (e) { error = e.message; } }
        await rpcAsServer('admin_sync_finish', { p_id: r.id, p_error: error }).catch(() => {});
        console.log('admin-sync', r.user.slice(0, 8), error || 'ok');
        await sleep(4000);
      }
    }
    const list = await rpcAsServer('auto_sync_candidates', { p_limit: 4, p_hours: 6 });
    for (const c of list) {
      const error = await syncSaved(c.user, c.blob, c.cred).catch((e) => e.message);
      console.log('auto-sync', c.user.slice(0, 8), error || 'ok');
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
// a fila do admin começa na hora: o app chama /api/sync/tick depois de pedir

const push = queuePush(rpcAsServer);
setTimeout(push.tick, 20_000).unref();
setInterval(push.tick, 60_000).unref();

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

server.listen(PORT, () => console.log(`PIU Stats API na porta ${PORT}`));

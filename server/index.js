// PumpStat API — entra no piugame.com com o login do usuário, lê os recordes e grava no Supabase
// usando o token do próprio usuário (RPC ingest_me). A senha da Pump nunca é gravada.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { DOMParser } from 'linkedom';
import { lastPage, parseProfile, parseRow, rowsOf, toPayload, isLoginPage } from './piu-parser.js';
import { piuLogin, PiuSession, switchSite } from './piu-session.js';

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jujbkgzkenktjuurrwvo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8_e3UpVPrgDdQbNlFitBvw_9uSoJG_t';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://pumpstat.onrender.com,http://localhost:5173').split(',');
const SITES = { phoenix2: 'https://piugame.com', phoenix: 'https://phoenix.piugame.com' };
const PAGE_DELAY_MS = 250;

const jobs = new Map(); // jobId -> { userId, state, message, progress, results, error, at }
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
  return toPayload(version, profile, bests, plays);
}

async function runJob(job, { login, password, versions, token }) {
  try {
    job.message = 'Entrando no piugame.com…';
    const session = await piuLogin(login, password);
    for (const version of versions) {
      const label = version === 'phoenix' ? 'Phoenix' : 'Phoenix 2';
      job.message = `${label}: abrindo a sessão…`;
      await switchSite(session, SITES[version]);
      const payload = await scrapeVersion(session, version, job);
      job.message = `${label}: gravando ${payload.bests.length} recordes…`;
      job.results[version] = { ...(await ingestMe(token, payload)), bests: payload.bests.length, plays: payload.plays.length };
      job.progress = Object.keys(job.results).length / versions.length;
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
    // Diagnóstico temporário: testa o fluxo de login com credenciais FALSAS (verifica a mensagem de erro)
    if (req.method === 'POST' && url.pathname === '/debug/login-fake') {
      try { await piuLogin('pumpstat-teste-inexistente@example.com', 'senha-errada-123'); return send(res, 200, { unexpected: 'logou?' }, origin); }
      catch (e) { return send(res, 200, { error: e.message }, origin); }
    }
    // Diagnóstico temporário: estrutura pública da página de login (sem credenciais)
    if (url.pathname === '/debug/login-page') {
      const base = SITES[url.searchParams.get('v') || 'phoenix2'];
      const s = new PiuSession(base);
      const hops = [];
      const orig = s.store.bind(s);
      s.store = (u, r) => { hops.push({ url: u, status: r.status, location: r.headers.get('location') }); orig(u, r); };
      const page = await s.get(url.searchParams.get('path') || '/login.php');
      const doc = parseHtml(page.html);
      const forms = [...doc.querySelectorAll('form')].map((f) => ({
        id: f.getAttribute('id'), action: f.getAttribute('action'), method: f.getAttribute('method'),
        inputs: [...f.querySelectorAll('input,select,button')].map((i) => `${i.getAttribute('name') || i.getAttribute('id') || i.tagName}:${i.getAttribute('type') || ''}${i.getAttribute('type') === 'hidden' ? '=' + (i.getAttribute('value') || '').slice(0, 60) : ''}`),
      }));
      const scripts = [...doc.querySelectorAll('script')].map((x) => x.getAttribute('src') || x.textContent)
        .flatMap((t) => (t.match(/[^\n]{0,120}(login|ajax|\.post\(|fetch\(|AM_PASS|sns)[^\n]{0,220}/gi) || []))
        .filter((t) => !/\\u[0-9a-f]{4}/i.test(t)).slice(0, 40);
      return send(res, 200, { final: page.url, status: page.status, hops, cookies: [...s.cookies].map(([h, j]) => [h, [...j.keys()]]), forms, scripts }, origin);
    }

    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const user = token ? await supabaseUser(token) : null;
    if (!user?.id) return send(res, 401, { error: 'Faça login no PumpStat.' }, origin);

    if (req.method === 'POST' && url.pathname === '/api/piu/sync') {
      const { login, password, versions } = await readJson(req);
      if (!login || !password) return send(res, 400, { error: 'Informe o login e a senha da Pump It Up.' }, origin);
      const vs = (Array.isArray(versions) && versions.length ? versions : ['phoenix2', 'phoenix']).filter((v) => SITES[v]);
      const running = [...jobs.values()].find((j) => j.userId === user.id && j.state === 'running');
      if (running) return send(res, 409, { error: 'Já existe uma sincronização em andamento.', jobId: running.id }, origin);
      const job = { id: randomUUID(), userId: user.id, state: 'running', message: 'Começando…', progress: 0, results: {}, at: Date.now() };
      jobs.set(job.id, job);
      runJob(job, { login: String(login).trim(), password: String(password), versions: vs, token });
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

// limpa jobs antigos
setInterval(() => { const lim = Date.now() - 30 * 60_000; for (const [id, j] of jobs) if (j.state !== 'running' && j.at < lim) jobs.delete(id); }, 60_000).unref();

server.listen(PORT, () => console.log(`PumpStat API na porta ${PORT}`));

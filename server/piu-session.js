// Sessão HTTP com cookies para o piugame.com / phoenix.piugame.com (e o SSO do AM.PASS).
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { Agent } from 'undici';

// O piugame.com não envia o certificado intermediário (o navegador baixa sozinho, o Node não).
// Buscamos o intermediário indicado no próprio certificado (AIA "CA Issuers") e validamos normalmente com ele.
const extraCAs = new Map(); // host -> PEM
let dispatcher = null;

async function intermediateFor(host) {
  if (extraCAs.has(host)) return extraCAs.get(host);
  const cert = await new Promise((resolve, reject) => {
    // conexão só para ler o certificado do servidor; nenhum dado é enviado por ela
    const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const c = sock.getPeerCertificate(false); sock.end(); resolve(c);
    });
    sock.on('error', reject);
  });
  const aia = (cert.infoAccess && cert.infoAccess['CA Issuers - URI']) || [];
  let pem = null;
  for (const u of aia) {
    try {
      const der = Buffer.from(await (await fetch(u)).arrayBuffer());
      pem = new X509Certificate(der).toString();
      break;
    } catch { /* tenta o próximo */ }
  }
  extraCAs.set(host, pem);
  return pem;
}

async function getDispatcher() {
  if (dispatcher) return dispatcher;
  const pems = [];
  for (const h of ['piugame.com', 'phoenix.piugame.com', 'am-pass.net']) {
    try { const p = await intermediateFor(h); if (p) pems.push(p); } catch { /* host sem o problema */ }
  }
  dispatcher = new Agent({ connect: { ca: [...tls.rootCertificates, ...new Set(pems)] } });
  return dispatcher;
}
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 PumpStat/0.1';

export class PiuSession {
  constructor(base) {
    this.base = base;
    this.cookies = new Map(); // host -> Map(name -> value)
  }

  cookieHeader(url) {
    const host = new URL(url).hostname;
    const out = [];
    for (const [h, jar] of this.cookies) {
      if (host === h || host.endsWith('.' + h.replace(/^\./, ''))) for (const [k, v] of jar) out.push(`${k}=${v}`);
    }
    return out.join('; ');
  }

  store(url, res) {
    const host = new URL(url).hostname;
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const dom = (attrs.find((a) => /^\s*domain=/i.test(a)) || '').split('=')[1]?.trim().replace(/^\./, '') || host;
      if (!this.cookies.has(dom)) this.cookies.set(dom, new Map());
      if (/=\s*deleted\s*$/i.test(pair) || /max-age=0/i.test(c)) this.cookies.get(dom).delete(name);
      else this.cookies.get(dom).set(name, value);
    }
  }

  /** Requisição seguindo redirecionamentos manualmente para guardar os cookies de cada passo. */
  async request(pathOrUrl, { method = 'GET', form, headers = {} } = {}) {
    let url = new URL(pathOrUrl, this.base).toString();
    let body = form ? new URLSearchParams(form).toString() : undefined;
    for (let hop = 0; hop < 10; hop++) {
      const res = await fetch(url, {
        dispatcher: await getDispatcher(),
        method,
        redirect: 'manual',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/json,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          Cookie: this.cookieHeader(url),
          Referer: this.base + '/',
          ...headers,
        },
        body,
      });
      this.store(url, res);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url).toString();
        method = 'GET'; body = undefined;
        continue;
      }
      return { status: res.status, url, html: await res.text() };
    }
    throw new Error('Redirecionamentos demais no login do piugame.');
  }

  get(path) { return this.request(path); }
}

/**
 * Faz login no site da versão (piugame.com ou phoenix.piugame.com) e devolve a sessão pronta.
 * O fluxo exato do AM.PASS é preenchido em LOGIN_FLOW depois de observado no navegador.
 */
export async function piuLogin(base, login, password) {
  const s = new PiuSession(base);
  await LOGIN_FLOW(s, login, password);
  const check = await s.get('/my_page/play_data.php');
  if (/login\.php/.test(check.url) || /type=["']password["']/i.test(check.html)) {
    throw new Error('Login ou senha da Pump It Up incorretos (ou login do exterior bloqueado no AM.PASS).');
  }
  return s;
}

// Preenchido após observar a requisição real de login (ver docs/SPEC.md).
let LOGIN_FLOW = async () => { throw new Error('Login no piugame ainda não configurado.'); };
export function setLoginFlow(fn) { LOGIN_FLOW = fn; }

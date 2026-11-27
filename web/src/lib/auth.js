// Login com e-mail e senha via Supabase Auth (REST, sem SDK).
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { AUTH_REDIRECT, isNative, openExternal } from './native.js';

const STORE = 'pumpstat:session';
let session = read();
const listeners = new Set();

function jwtSub(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch { return null; }
}
// a sessão leva user.id (o "sub" do token) para as telas saberem quem está logado
// declaração de função (e não const): read() roda na carga do módulo, antes desta linha. Com const, read() caía
// no try/catch e devolvia null, e o app abria sempre deslogado.
function withUser(s) {
  return s && s.access_token && !s.user?.id ? { ...s, user: { id: jwtSub(s.access_token), email: s.email } } : s;
}
function read() {
  try { return withUser(JSON.parse(localStorage.getItem(STORE) || 'null')); } catch { return null; }
}
// O cache de dados das versões é grande. Se o armazenamento do aparelho encher, a sessão não pode ficar de fora:
// apaga o cache de dados e grava de novo (sem isso o login sumia ao fechar o app, sobretudo no iPhone).
function persist(s) {
  if (!s) { try { localStorage.removeItem(STORE); } catch { /* ignore */ } return; }
  const text = JSON.stringify(s);
  try { localStorage.setItem(STORE, text); return; } catch { /* cheio: libera espaço abaixo */ }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('pumpstat:data:') || k.startsWith('pumpstat:prog:')).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(STORE, text);
  } catch { /* sem armazenamento: a sessão fica só na memória */ }
}
function save(s) {
  session = s;
  persist(s);
  listeners.forEach((fn) => fn(s));
}
// outra aba (ou o app e o site no mesmo aparelho) renovou ou saiu: acompanha, sem gravar de novo
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE) return;
    session = read();
    listeners.forEach((fn) => fn(session));
  });
}
export const getSession = () => session;
export const onSession = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

async function call(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(translate(data.error_description || data.msg || data.message || `Erro ${res.status}`));
    err.status = res.status;
    throw err;
  }
  return data;
}

function emailFromJwt(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email; } catch { return null; }
}

function store(data) {
  if (!data.access_token) return null;
  const s = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    email: data.user?.email || data.email || emailFromJwt(data.access_token),
  };
  s.user = { id: data.user?.id || jwtSub(data.access_token), email: s.email };
  save(s);
  return s;
}

export async function signIn(email, password) {
  return store(await call('token?grant_type=password', { email, password }));
}

/** Cria a conta. Se o projeto exige confirmação por e-mail, volta sem sessão. */
export async function signUp(email, password) {
  const redirect = encodeURIComponent(window.location.origin + window.location.pathname);
  const data = await call(`signup?redirect_to=${redirect}`, { email, password });
  return store(data);
}

/** Login com Google (mesmo fluxo do Fênix Analyzer: Supabase OAuth). Volta com #access_token na URL. */
export function signInWithGoogle() {
  // no app nativo o Google não deixa logar dentro da webview: abre no navegador do sistema e volta pelo link do app
  const redirect = encodeURIComponent(isNative ? AUTH_REDIRECT : window.location.origin + window.location.pathname);
  openExternal(`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`);
}

export async function resetPassword(email) {
  const redirect = encodeURIComponent(window.location.origin + window.location.pathname);
  await call(`recover?redirect_to=${redirect}`, { email });
}

export function signOut() {
  const s = session;
  save(null);
  if (s) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
  }
}

let refreshing = null;
/** Token válido, renovando quando faltar menos de 1 minuto. */
export async function accessToken() {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  if (!refreshing) {
    // outra aba pode já ter renovado (o refresh token só vale uma vez): usa o que estiver gravado, se for mais novo
    const disk = read();
    if (disk?.refresh_token && disk.refresh_token !== session.refresh_token && disk.expires_at >= session.expires_at) {
      session = disk;
      if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    }
    const used = session.refresh_token;
    refreshing = call('token?grant_type=refresh_token', { refresh_token: used })
      .then(store)
      .catch((e) => {
        // só sai da conta quando o servidor recusa o token; sem internet (app acordando, rede caindo) mantém o login
        if (e.status === 400 || e.status === 401 || e.status === 403) {
          const now = read();
          if (now?.refresh_token && now.refresh_token !== used) { session = now; return now; }
          save(null);
          return null;
        }
        return session;
      })
      .finally(() => { refreshing = null; });
  }
  const s = await refreshing;
  return s?.access_token || null;
}

/** Sessão vinda do link de confirmação/recuperação (#access_token=... na URL). */
/** Login que volta pelo link do app (com.henriquecarluci.stepclub://auth#access_token=...). */
export function sessionFromHash(h) {
  if (h.includes('error_description=')) return { error: new URLSearchParams(h.replace(/^#\/?/, '')).get('error_description') };
  if (!h.includes('access_token=')) return null;
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  return {
    session: store({
      email: emailFromJwt(p.get('access_token')),
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      expires_in: +(p.get('expires_in') || 3600),
    }),
    type: p.get('type'),
  };
}

export function sessionFromUrl() {
  const h = window.location.hash;
  if (h.includes('error_description=')) {
    const e = new URLSearchParams(h.replace(/^#\/?/, '')).get('error_description');
    window.history.replaceState(null, '', window.location.pathname + '#/');
    return { error: e };
  }
  if (!h.includes('access_token=')) return null;
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  const s = store({
    email: emailFromJwt(p.get('access_token')),
    access_token: p.get('access_token'),
    refresh_token: p.get('refresh_token'),
    expires_in: +(p.get('expires_in') || 3600),
  });
  window.history.replaceState(null, '', window.location.pathname + '#/');
  return { session: s, type: p.get('type') };
}

export async function updatePassword(password) {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(translate((await res.json().catch(() => ({}))).msg || 'Não foi possível trocar a senha'));
}

function translate(m) {
  const map = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme o e-mail pelo link que enviamos antes de entrar.',
    'User already registered': 'Este e-mail já tem conta. Use "Entrar".',
    'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.',
  };
  return map[m] || m;
}

/** id do usuário logado (campo "sub" do token), ou null. */
export function currentUserId() {
  try { return session ? JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub : null; } catch { return null; }
}

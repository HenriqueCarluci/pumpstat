// Login com e-mail e senha via Supabase Auth (REST, sem SDK).
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

const STORE = 'pumpstat:session';
let session = read();
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
function save(s) {
  session = s;
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(s));
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
  if (!res.ok) throw new Error(translate(data.error_description || data.msg || data.message || `Erro ${res.status}`));
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
  const redirect = encodeURIComponent(window.location.origin + window.location.pathname);
  window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
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
    refreshing = call('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(store)
      .catch(() => { save(null); return null; })
      .finally(() => { refreshing = null; });
  }
  const s = await refreshing;
  return s?.access_token || null;
}

/** Sessão vinda do link de confirmação/recuperação (#access_token=... na URL). */
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

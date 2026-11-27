// Verificação em duas etapas (TOTP) pelo Supabase Auth, no mesmo modelo do Fênix Analyzer:
// o segredo fica só no Supabase (o app nunca guarda), é opcional e, depois de ativada, todo login pede o código.
import { adoptSession, authRequest, getSession } from './auth.js';

const NAME = 'PIU Stats';
const HINT = 'pumpstat:mfa:'; // lembra no aparelho que a conta tem autenticador (para pedir o código sem piscar o app)

export function sessionAal(s = getSession()) {
  try { return JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal || 'aal1'; } catch { return 'aal1'; }
}

export async function listFactors() {
  return totp(await authRequest('user'));
}
const totp = (u) => (u.factors || []).filter((f) => f.factor_type === 'totp');

// convite para ativar: aparece uma vez por conta (guardado na própria conta, vale em todos os aparelhos)
const ASKED = 'pumpstat:mfa-asked:';
/** true quando vale mostrar o convite: sem autenticador e sem ter respondido antes. */
export async function shouldInvite(uid) {
  try { if (localStorage.getItem(ASKED + uid)) return false; } catch { /* ignore */ }
  const u = await authRequest('user');
  if (verifiedFactor(totp(u)) || u.user_metadata?.mfa_invite_done) {
    try { localStorage.setItem(ASKED + uid, '1'); } catch { /* ignore */ }
    return false;
  }
  return true;
}
export async function markInvited(uid) {
  try { localStorage.setItem(ASKED + uid, '1'); } catch { /* ignore */ }
  await authRequest('user', { method: 'PUT', body: { data: { mfa_invite_done: true } } }).catch(() => {});
}
export const verifiedFactor = (list) => list.find((f) => f.status === 'verified') || null;

export function rememberHint(uid, on) {
  try { if (on) localStorage.setItem(HINT + uid, '1'); else localStorage.removeItem(HINT + uid); } catch { /* sem armazenamento */ }
}
export function hasHint(uid) {
  try { return localStorage.getItem(HINT + uid) === '1'; } catch { return false; }
}

/** Começa o cadastro: apaga tentativas não concluídas e devolve { id, qr, secret }. */
export async function startEnroll() {
  const list = await listFactors();
  for (const f of list.filter((x) => x.status !== 'verified')) await authRequest(`factors/${f.id}`, { method: 'DELETE' });
  const d = await authRequest('factors', { method: 'POST', body: { factor_type: 'totp', issuer: NAME, friendly_name: NAME } });
  return { id: d.id, qr: d.totp?.qr_code, secret: d.totp?.secret };
}

/** Confere o código de 6 dígitos; a sessão passa a valer como verificada (aal2). */
export async function verifyCode(factorId, code) {
  const ch = await authRequest(`factors/${factorId}/challenge`, { method: 'POST', body: {} });
  const s = await authRequest(`factors/${factorId}/verify`, { method: 'POST', body: { challenge_id: ch.id, code } });
  const next = adoptSession(s);
  if (next?.user?.id) rememberHint(next.user.id, true);
  return next;
}

export async function removeFactor(factorId) {
  await authRequest(`factors/${factorId}`, { method: 'DELETE' });
  const uid = getSession()?.user?.id;
  if (uid) rememberHint(uid, false);
}

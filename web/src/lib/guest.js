// Modo visitante: sem login, só o tier e as tags dos charts. Ligado pelo admin (app_config().guest.enabled).
const KEY = 'pumpstat:guest';
export const isGuest = () => { try { return sessionStorage.getItem(KEY) === '1' || localStorage.getItem(KEY) === '1'; } catch { return false; } };
export function setGuest(on) {
  try { if (on) localStorage.setItem(KEY, '1'); else { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } } catch { /* ignora */ }
  window.dispatchEvent(new Event('pumpstat:guest'));
}

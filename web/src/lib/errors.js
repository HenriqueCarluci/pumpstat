// Erros de JavaScript do app vão para o admin (Monitoramento) para diagnóstico.
// Só com login, no máximo 5 por sessão e sem repetir a mesma mensagem.
import { rpc } from './api.js';
import { isNative } from './native.js';
import { isDesktopNow } from './desktop.js';

/* global __BUILD__ */
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
const seen = new Set();
let sent = 0;

export function platform() {
  return isNative ? 'android' : isDesktopNow() ? 'desktop' : 'mobile-web';
}

export function reportError(err, source) {
  try {
    const message = String(err?.message || err || '?').slice(0, 500);
    if (!message || seen.has(message) || sent >= 5) return;
    if (/ResizeObserver loop|Load failed|Failed to fetch|NetworkError|AbortError/i.test(message)) return; // ruído de rede/navegador
    seen.add(message); sent++;
    rpc('log_client_error', { p: {
      message, source: source || null, stack: String(err?.stack || '').slice(0, 2000), route: window.location.hash.slice(0, 200),
      build: BUILD, platform: platform(), ua: navigator.userAgent.slice(0, 300),
    } }).catch(() => {});
  } catch { /* nunca quebra o app por causa do relatório */ }
}

export function watchErrors() {
  window.addEventListener('error', (e) => reportError(e.error || e.message, `${e.filename || ''}:${e.lineno || ''}`));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'promise'));
}

/** Diagnóstico (não é erro): vai para o mesmo registro do admin com a origem "diag", para depurar o app no celular. */
export function reportDiag(message, extra) {
  try {
    rpc('log_client_error', { p: {
      message: `diag: ${String(message).slice(0, 480)}`, source: 'diag', stack: extra ? JSON.stringify(extra).slice(0, 2000) : '',
      route: window.location.hash.slice(0, 200), build: BUILD, platform: platform(), ua: navigator.userAgent.slice(0, 300),
    } }).catch(() => {});
  } catch { /* ignore */ }
}

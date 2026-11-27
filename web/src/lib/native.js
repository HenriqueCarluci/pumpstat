// Integração com o app nativo (Capacitor). No navegador, tudo aqui vira no-op.
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const APP_SCHEME = 'com.henriquecarluci.stepclub';
export const AUTH_REDIRECT = `${APP_SCHEME}://auth`;

/** Abre uma URL externa: no app, no navegador do sistema (necessário para o login com Google). */
export async function openExternal(url) {
  if (!isNative) { window.location.href = url; return; }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'popover' });
}

/** Configura barra de status, splash, botão voltar do Android e a volta do login pelo link do app. */
export async function initNative({ onAuthHash }) {
  if (!isNative) return;
  const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/splash-screen'), import('@capacitor/status-bar'),
  ]);
  try { await StatusBar.setStyle({ style: Style.Dark }); } catch { /* iOS/Android antigos */ }
  App.addListener('appUrlOpen', async ({ url }) => {
    // QR da fila aberto no app: com.henriquecarluci.stepclub://fila/<local>?checkin=1
    const m = url?.match(/^[a-z.]+:\/\/fila\/([^?#/]+)(\?[^#]*)?/i);
    if (m) { window.location.hash = `#/fila/${m[1]}${m[2] || ''}`; return; }
    if (!url?.startsWith(AUTH_REDIRECT)) return;
    const hash = url.includes('#') ? url.slice(url.indexOf('#')) : `#${url.split('?')[1] || ''}`;
    try { const { Browser } = await import('@capacitor/browser'); await Browser.close(); } catch { /* já fechado */ }
    onAuthHash(hash);
  });
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.hash && window.location.hash !== '#/') window.history.back();
    else App.exitApp();
  });
  setTimeout(() => SplashScreen.hide().catch(() => {}), 300);
}

/** Localização: no app usa o plugin nativo (pede a permissão do sistema); no navegador, a API padrão. */
export async function nativePosition() {
  const { Geolocation } = await import('@capacitor/geolocation');
  const perm = await Geolocation.checkPermissions().catch(() => null);
  if (perm && perm.location !== 'granted') {
    const r = await Geolocation.requestPermissions({ permissions: ['location'] }).catch(() => null);
    if (r && r.location === 'denied') throw Object.assign(new Error('denied'), { code: 1 });
  }
  const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  return { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
}

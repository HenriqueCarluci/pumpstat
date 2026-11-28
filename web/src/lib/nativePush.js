// Push no app Android (Firebase Cloud Messaging via @capacitor/push-notifications).
// O token do aparelho vai para push_fcm (ligado à conta); o servidor manda os avisos pelo FCM.
import { Capacitor } from '@capacitor/core';
import { rpc } from './api.js';
import { API_URL } from './config.js';

const OFF_KEY = 'pumpstat:fcm-off';
const TOKEN_KEY = 'pumpstat:fcm-token';
const ASKED_KEY = 'pumpstat:fcm-asked';

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem storage */ } },
};

export const nativePushAvailable = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PushNotifications');

let ready = null;
let PN = null; // o plugin não pode sair de função async (o proxy do Capacitor responde a .then)
let waiting = [];

/** Canais, listeners do token e do toque no aviso. Roda uma vez por abertura do app. */
function setup() {
  if (ready) return ready;
  ready = (async () => {
    const mod = await import('@capacitor/push-notifications');
    PN = mod.PushNotifications;
    const PushNotifications = PN;
    await PushNotifications.createChannel({ id: 'avisos', name: 'Avisos', description: 'Mensagens, convites, amigos e novidades', importance: 4, visibility: 1, lights: true, lightColor: '#8CFF3A', vibration: true }).catch(() => {});
    await PushNotifications.createChannel({ id: 'fila', name: 'Fila e check-in', description: 'Quando você é o próximo e quando chega a sua vez', importance: 5, visibility: 1, lights: true, lightColor: '#8CFF3A', vibration: true }).catch(() => {});
    await PushNotifications.addListener('registration', async ({ value }) => {
      ls.set(TOKEN_KEY, value);
      try { await rpc('push_fcm_register', { p_token: value }); } catch { /* sem login: liga na próxima vez */ }
      fetch(`${API_URL}/api/push/queue-tick`, { method: 'POST' }).catch(() => {});
      waiting.forEach((w) => w.ok(value)); waiting = [];
    });
    await PushNotifications.addListener('registrationError', ({ error }) => {
      waiting.forEach((w) => w.fail(new Error(error || 'Não deu para ligar os avisos neste aparelho.'))); waiting = [];
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const url = String(notification?.data?.url || '');
      const i = url.indexOf('#/');
      if (i >= 0) window.location.hash = url.slice(i + 1);
    });
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

function register() {
  return new Promise((ok, fail) => {
    waiting.push({ ok, fail });
    PN.register().catch(fail);
    setTimeout(() => fail(new Error('O aparelho demorou para responder. Tente de novo.')), 20000);
  });
}

/** 'on' | 'off' | 'denied' */
export async function nativePushStatus() {
  await setup();
  const p = await PN.checkPermissions();
  if (p.receive === 'denied') return 'denied';
  if (p.receive !== 'granted' || ls.get(OFF_KEY) === '1') return 'off';
  return ls.get(TOKEN_KEY) ? 'on' : 'off';
}

export async function enableNativePush() {
  await setup();
  let p = await PN.checkPermissions();
  if (p.receive !== 'granted') p = await PN.requestPermissions();
  if (p.receive !== 'granted') throw new Error('As notificações estão bloqueadas para o PIU Stats. Libere nas configurações do aparelho.');
  ls.set(OFF_KEY, null);
  ls.set(ASKED_KEY, '1');
  const tok = await register();
  await rpc('push_fcm_register', { p_token: tok });
}

export async function disableNativePush() {
  await setup();
  const tok = ls.get(TOKEN_KEY);
  ls.set(OFF_KEY, '1');
  if (tok) await rpc('push_fcm_unregister', { p_token: tok }).catch(() => {});
  ls.set(TOKEN_KEY, null);
  await PN.unregister().catch(() => {});
}

/**
 * Ao abrir o app (e ao entrar na conta): renova o token e liga à conta atual.
 * Na primeira vez com login, pede a permissão sozinho — o Android mostra a pergunta do sistema.
 */
export async function syncNativePush(loggedIn) {
  if (!nativePushAvailable()) return;
  try {
    await setup();
    if (!loggedIn || ls.get(OFF_KEY) === '1') return;
    const p = await PN.checkPermissions();
    if (p.receive === 'granted') { await register().catch(() => {}); return; }
    if (p.receive !== 'denied' && !ls.get(ASKED_KEY)) {
      ls.set(ASKED_KEY, '1');
      await enableNativePush().catch(() => {});
    }
  } catch { /* sem aviso, sem problema */ }
}

// Aviso de "sua vez" na fila pelo navegador (Web Push). Só liga se a pessoa pedir.
import { rpc } from './api.js';
import { API_URL } from './config.js';
import { isNative } from './native.js';
import { deviceToken } from './queue.js';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'native' | 'ios-install' | 'unsupported' | 'denied' | 'on' | 'off' */
export async function pushStatus() {
  if (isNative) return 'native';
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!ok) return isIOS() && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg && await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function b64ToBytes(s) {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'As notificações estão bloqueadas para o PIU Stats. Libere nas configurações do navegador.'
    : 'Sem permissão para notificações.');
  const key = await rpc('push_public_key');
  if (!key) throw new Error('Os avisos ainda não estão disponíveis. Tente de novo em alguns minutos.');
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  const j = sub.toJSON();
  await rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_token: deviceToken() });
  // se a pessoa já for a próxima, o aviso sai na hora
  fetch(`${API_URL}/api/push/queue-tick`, { method: 'POST' }).catch(() => {});
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return;
  await rpc('push_unsubscribe', { p_endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Mantém a inscrição ligada à conta atual (quem ativou sem login e depois entrou, por exemplo). */
export async function refreshPush() {
  try {
    if ((await pushStatus()) !== 'on') return;
    const reg = await navigator.serviceWorker.getRegistration('./');
    const j = (await reg.pushManager.getSubscription()).toJSON();
    await rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_token: deviceToken() });
  } catch { /* sem aviso, sem problema */ }
}

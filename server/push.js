// Push: avisos da fila e de tudo o que chega no sino (mensagens, convites, amigos, time, app...).
// Navegador: Web Push (chaves VAPID geradas aqui na primeira vez e guardadas no banco).
// App Android: Firebase Cloud Messaging (HTTP v1) com a conta de serviço em FCM_SERVICE_ACCOUNT (JSON).
import { createSign } from 'node:crypto';
import webpush from 'web-push';

// ---------- Firebase (FCM HTTP v1) ----------
let fcmCfg;
function fcmAccount() {
  if (fcmCfg !== undefined) return fcmCfg;
  try {
    const j = JSON.parse(process.env.FCM_SERVICE_ACCOUNT || '');
    fcmCfg = j.client_email && j.private_key && j.project_id ? j : null;
  } catch { fcmCfg = null; }
  return fcmCfg;
}
const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
let fcmToken = null; // { token, exp }
async function fcmAccess() {
  const sa = fcmAccount();
  if (!sa) return null;
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'RS256', typ: 'JWT' });
  const claim = b64u({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`FCM token: ${r.status} ${j.error || ''}`);
  fcmToken = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return fcmToken.token;
}

/** Manda para um aparelho Android. Devolve 'gone' quando o token não vale mais. */
async function sendFcm(n) {
  const sa = fcmAccount();
  const access = await fcmAccess();
  if (!sa || !access) return 'off';
  const image = typeof n.image === 'string' && /^https:\/\//.test(n.image) ? n.image : undefined;
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: n.fcm,
        notification: { title: n.title || 'PIU Stats', body: n.body || '', ...(image ? { image } : {}) },
        data: { url: String(n.url || '/#/') },
        android: {
          priority: 'high',
          ttl: n.tag === 'fila' ? '600s' : '86400s',
          notification: { channel_id: n.tag === 'fila' ? 'fila' : 'avisos', icon: 'ic_stat_piu', color: '#8CFF3A', tag: n.tag || undefined },
        },
      },
    }),
  });
  if (r.ok) return 'ok';
  const j = await r.json().catch(() => ({}));
  const code = j?.error?.details?.find?.((d) => d.errorCode)?.errorCode || j?.error?.status;
  if (r.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'gone';
  console.log('fcm:', r.status, code || j?.error?.message);
  return 'err';
}

export function queuePush(rpc) {
  let ready = null;
  let busy = false;
  let again = false;

  async function setup() {
    let keys = await rpc('push_vapid', {});
    if (!keys?.public || !keys?.private) {
      const k = webpush.generateVAPIDKeys();
      keys = await rpc('push_vapid', { p_public: k.publicKey, p_private: k.privateKey });
    }
    webpush.setVapidDetails('https://piustats.com.br', keys.public, keys.private);
    return true;
  }

  async function deliver(list, urgentTtl) {
    for (const n of Array.isArray(list) ? list : []) {
      if (n.fcm) {
        try {
          if ((await sendFcm(n)) === 'gone') await rpc('push_fcm_drop', { p_token: n.fcm }).catch(() => {});
        } catch (e) { console.log('fcm:', e.message); }
        continue;
      }
      if (!n.endpoint) continue;
      const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag || 'piustats', image: n.image || undefined });
      try {
        await webpush.sendNotification({ endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } }, payload,
          { TTL: urgentTtl ? 600 : 86400, urgency: urgentTtl ? 'high' : 'normal' });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await rpc('push_drop', { p_endpoint: n.endpoint }).catch(() => {});
        else console.log('push:', e.statusCode || e.message);
      }
    }
  }

  async function run() {
    ready = ready || setup().catch((e) => { ready = null; throw e; });
    await ready;
    await deliver(await rpc('queue_push_due', {}), true);
    // avisos do sino (a função ainda pode não existir enquanto a migração 116 não entrou)
    const due = await rpc('notif_push_due', {}).catch((e) => { if (!/notif_push_due/.test(e.message)) console.log('push sino:', e.message); return []; });
    await deliver(due, false);
  }

  // várias mudanças seguidas viram uma rodada só (e uma a mais, se algo mudou durante o envio)
  function tick() {
    if (!process.env.INGEST_KEY) return;
    if (busy) { again = true; return; }
    busy = true;
    run().catch((e) => console.error('push:', e.message)).finally(() => {
      busy = false;
      if (again) { again = false; tick(); }
    });
  }
  return { tick };
}

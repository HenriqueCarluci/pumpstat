// Avisos da fila por Web Push: as chaves VAPID são geradas aqui na primeira vez e ficam guardadas no banco.
import webpush from 'web-push';

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

  async function run() {
    ready = ready || setup().catch((e) => { ready = null; throw e; });
    await ready;
    const due = await rpc('queue_push_due', {});
    for (const n of Array.isArray(due) ? due : []) {
      const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: 'fila' });
      try {
        await webpush.sendNotification({ endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } }, payload,
          { TTL: 600, urgency: 'high' });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await rpc('push_drop', { p_endpoint: n.endpoint }).catch(() => {});
        else console.log('push:', e.statusCode || e.message);
      }
    }
  }

  // várias mudanças seguidas na fila viram uma rodada só (e uma a mais, se algo mudou durante o envio)
  function tick() {
    if (!process.env.INGEST_KEY) return;
    if (busy) { again = true; return; }
    busy = true;
    run().catch((e) => console.error('push fila:', e.message)).finally(() => {
      busy = false;
      if (again) { again = false; tick(); }
    });
  }
  return { tick };
}

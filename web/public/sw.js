// Service worker só para os avisos (Web Push). Não guarda cache: o app continua sempre atualizado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data && e.data.text() }; }
  const base = self.registration.scope;
  e.waitUntil(self.registration.showNotification(d.title || 'PIU Stats', {
    body: d.body || '',
    // ícone da plataforma; o badge (barra de status do Android) precisa ser só a silhueta branca
    icon: new URL('icons/icon-192.png', base).href,
    badge: new URL('icons/badge-96.png', base).href,
    ...(d.image ? { image: d.image } : {}),
    tag: d.tag || 'piustats',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 300],
    data: { url: new URL(String(d.url || '').replace(/^\//, ''), base).href },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) { await c.focus(); if ('navigate' in c) c.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});

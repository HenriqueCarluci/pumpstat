// Lives da Twitch em andamento que eu posso ver (selo AO VIVO). Uma busca compartilhada pelo app, renovada a cada 5 min.
import { useEffect, useState } from 'react';
import { rpc } from './api.js';

const TTL = 5 * 60 * 1000;
let cache = { at: 0, map: new Map(), p: null };
const subs = new Set();

async function refresh() {
  if (cache.p) return cache.p;
  cache.p = rpc('lives_now').then((list) => {
    cache = { at: Date.now(), map: new Map((list || []).map((l) => [l.user, l])), p: null };
    subs.forEach((f) => f(cache.map));
  }).catch(() => { cache.p = null; cache.at = Date.now(); });
  return cache.p;
}

/** Map user_id → { login, title, game, started_at } de quem está ao vivo agora. */
export function useLives(enabled = true) {
  const [map, setMap] = useState(cache.map);
  useEffect(() => {
    if (!enabled) return undefined;
    subs.add(setMap);
    if (Date.now() - cache.at > TTL) refresh();
    const h = setInterval(() => { if (!document.hidden && Date.now() - cache.at > TTL) refresh(); }, 60000);
    return () => { subs.delete(setMap); clearInterval(h); };
  }, [enabled]);
  return map;
}

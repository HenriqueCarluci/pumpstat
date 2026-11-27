// Imagens do app (capas das músicas, notas, plates, bolinhas de nível e fotos de perfil dos amigos):
// por padrão baixam conforme aparecem; no app dá para baixar todas de uma vez e elas ficam no cache do aparelho.
import { rpc } from './api.js';
import { staticImageUrls } from '../components/ui.jsx';
import { reportDiag } from './errors.js';

const MODE = 'pumpstat:jackets';
const DONE = 'pumpstat:jackets-done';

export const jacketMode = () => { try { return localStorage.getItem(MODE) || 'lazy'; } catch { return 'lazy'; } };
export const jacketModeChosen = () => { try { return !!localStorage.getItem(MODE); } catch { return true; } };
export const setJacketMode = (m) => { try { localStorage.setItem(MODE, m); } catch { /* ignore */ } };

const readDone = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE) || '[]')); } catch { return new Set(); } };
const saveDone = (set) => { try { localStorage.setItem(DONE, JSON.stringify([...set])); } catch { /* ignore */ } };
const LAST = 'pumpstat:jackets-last';
export const lastJacketRun = () => { try { return JSON.parse(localStorage.getItem(LAST) || 'null'); } catch { return null; } };
const key = (u) => u.replace(/^https?:\/\/[^/]+\//, '');

/** Tudo o que dá para saber sem ir ao servidor: capas da versão atual, imagens fixas do jogo e a sua foto. */
export const jacketUrls = (data) => [...new Set([
  ...(data?.songs || []).map((s) => s.jacket),
  ...staticImageUrls(),
  data?.profile?.avatar_url,
].filter(Boolean))];

/** Fotos de perfil dos amigos e da comunidade (lista de jogadores). */
async function avatarUrls(version) {
  try {
    const list = await rpc('players', { p_version: version });
    return (list || []).map((p) => p.avatar).filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
  } catch { return []; }
}

export const pendingJackets = (data) => { const done = readDone(); return jacketUrls(data).filter((u) => !done.has(key(u))); };

let running = null;
/** Baixa as imagens que faltam, 6 por vez. onProgress(feitas, total). */
export function downloadJackets(data, onProgress) {
  if (running) { if (onProgress) running.listeners.add(onProgress); return running.promise; }
  const listeners = new Set(onProgress ? [onProgress] : []);
  const ctl = { stop: false };
  let n = 0;
  let total = 0;
  let ok = 0;
  const failed = [];
  const emit = () => listeners.forEach((fn) => fn(n, total));
  const one = (u, done) => new Promise((res) => {
    const im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.decoding = 'async';
    const tm = setTimeout(() => { failed.push(`${u} (timeout)`); im.src = ''; res(); }, 20000);
    im.onload = () => { clearTimeout(tm); ok += 1; done.add(key(u)); res(); };
    im.onerror = () => { clearTimeout(tm); failed.push(u); res(); };
    im.src = u;
  });
  const promise = (async () => {
    const t0 = Date.now();
    const done = readDone();
    const extra = await avatarUrls(data?.version);
    const urls = [...new Set([...jacketUrls(data), ...extra])].filter((u) => !done.has(key(u)));
    total = urls.length;
    emit();
    const queue = [...urls];
    const worker = async () => {
      while (queue.length && !ctl.stop) {
        await one(queue.shift(), done);
        n += 1; emit();
        if (n % 20 === 0) saveDone(done);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    saveDone(done);
    running = null;
    const res = { at: new Date().toISOString(), total, ok, fail: failed.length, sec: Math.round((Date.now() - t0) / 1000), stopped: ctl.stop };
    try { localStorage.setItem(LAST, JSON.stringify(res)); } catch { /* ignore */ }
    if (total) reportDiag(`imagens: ${ok} ok, ${failed.length} falharam de ${total} em ${res.sec}s`, { ...res, avatars: extra.length, sample: failed.slice(0, 5), online: navigator.onLine, conn: navigator.connection?.effectiveType || null });
    return { done: n, total, ok, fail: failed.length };
  })();
  running = { promise, listeners, ctl };
  return promise;
}
export const stopJackets = () => { if (running) running.ctl.stop = true; };
export const jacketsRunning = () => !!running;

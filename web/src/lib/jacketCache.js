// Capas das músicas: por padrão baixam conforme aparecem; quem quiser pode baixar todas de uma vez
// (ficam no cache do aparelho e a lista de músicas abre com tudo pronto, mesmo com internet ruim).
const MODE = 'pumpstat:jackets';
const DONE = 'pumpstat:jackets-done';

export const jacketMode = () => { try { return localStorage.getItem(MODE) || 'lazy'; } catch { return 'lazy'; } };
export const jacketModeChosen = () => { try { return !!localStorage.getItem(MODE); } catch { return true; } };
export const setJacketMode = (m) => { try { localStorage.setItem(MODE, m); } catch { /* ignore */ } };

const readDone = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE) || '[]')); } catch { return new Set(); } };
const saveDone = (set) => { try { localStorage.setItem(DONE, JSON.stringify([...set])); } catch { /* ignore */ } };
const key = (u) => u.split('/').pop();

export const jacketUrls = (data) => [...new Set((data?.songs || []).map((s) => s.jacket).filter(Boolean))];
export const pendingJackets = (data) => { const done = readDone(); return jacketUrls(data).filter((u) => !done.has(key(u))); };

let running = null;
/** Baixa as capas que faltam, 6 por vez. onProgress(feitas, total). Devolve quando termina ou é cancelado. */
export function downloadJackets(data, onProgress) {
  if (running) { running.listeners.add(onProgress); return running.promise; }
  const urls = pendingJackets(data);
  const done = readDone();
  const total = urls.length;
  let n = 0;
  const listeners = new Set(onProgress ? [onProgress] : []);
  const emit = () => listeners.forEach((fn) => fn(n, total));
  const ctl = { stop: false };
  const one = (u) => new Promise((res) => {
    const im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.decoding = 'async';
    im.onload = () => { done.add(key(u)); res(); };
    im.onerror = () => res();
    im.src = u;
  });
  const promise = (async () => {
    const queue = [...urls];
    const worker = async () => {
      while (queue.length && !ctl.stop) {
        await one(queue.shift());
        n += 1; emit();
        if (n % 20 === 0) saveDone(done);
      }
    };
    emit();
    await Promise.all(Array.from({ length: 6 }, worker));
    saveDone(done);
    running = null;
    return { done: n, total };
  })();
  running = { promise, listeners, ctl };
  return promise;
}
export const stopJackets = () => { if (running) running.ctl.stop = true; };
export const jacketsRunning = () => !!running;

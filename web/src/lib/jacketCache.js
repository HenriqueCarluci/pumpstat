// Imagens do app (capas das músicas, notas, plates, bolinhas de nível, ícones de PUMBILITY e fotos de perfil).
// No app cada imagem vira um arquivo no aparelho (lib/imgStore.js). Dois modos:
//   'lazy' (padrão): salva cada imagem na primeira vez que aparece na tela;
//   'all': baixa tudo de uma vez e completa as novas sozinho (só no Wi-Fi, quando dá para saber).
import { rpc } from './api.js';
import { staticImageUrls } from '../components/ui.jsx';
import { reportDiag } from './errors.js';
import { Capacitor } from '@capacitor/core';
import { initImgStore, isStored, saveImg } from './imgStore.js';

const native = Capacitor.isNativePlatform();

const MODE = 'pumpstat:jackets';
const DONE = 'pumpstat:jackets-done';
const LAST = 'pumpstat:jackets-last';
const FAILS = 'pumpstat:jackets-fails';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const jacketMode = () => { try { return localStorage.getItem(MODE) || 'lazy'; } catch { return 'lazy'; } };
export const jacketModeChosen = () => { try { return !!localStorage.getItem(MODE); } catch { return true; } };
export const setJacketMode = (m) => { try { localStorage.setItem(MODE, m); } catch { /* ignore */ } };
export const lastJacketRun = () => read(LAST, null);

const readDone = () => new Set(read(DONE, []));
const saveDone = (set) => write(DONE, [...set]);
const key = (u) => u.replace(/^https?:\/\/[^/]+\//, '');

// Imagem que falhou 3 vezes seguidas fica "indisponível" por 3 dias (não conta como pendente nem trava o "Faltam").
const RETRY_MS = 3 * 24 * 3600 * 1000;
const isUnavailable = (u, fails = read(FAILS, {})) => { const f = fails[key(u)]; return !!f && f.n >= 3 && Date.now() - f.at < RETRY_MS; };

/** Dá para saber que é dado móvel? (Android informa; no resto fica indefinido e o app segue normal.) */
export const onCellular = () => navigator.connection?.type === 'cellular';

// Imagens que aparecem fora das listas (notificações, por exemplo): o app registra aqui para entrarem no "Baixar todas".
const extraUrls = new Set();
export const addImageUrls = (list) => (list || []).forEach((u) => { if (typeof u === 'string' && /^https:\/\//.test(u)) extraUrls.add(u); });

/** Tudo o que dá para saber sem ir ao servidor: capas da versão atual, imagens fixas do jogo, fotos já conhecidas. */
export const jacketUrls = (data) => [...new Set([
  ...(data?.songs || []).map((s) => s.jacket),
  ...staticImageUrls(),
  data?.profile?.avatar_url,
  ...extraUrls,
].filter(Boolean))];

/** Fotos de perfil dos amigos e da comunidade (lista de jogadores); ficam lembradas para a contagem do card. */
async function avatarUrls(version) {
  try {
    const list = await rpc('players', { p_version: version });
    const urls = (list || []).map((p) => p.avatar).filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
    addImageUrls(urls);
    return urls;
  } catch { return []; }
}

/** O que ainda falta: no app, o que não está salvo na pasta (sem contar as indisponíveis); no site, o que não foi aquecido. */
export const pendingJackets = (data) => {
  if (native) { const fails = read(FAILS, {}); return jacketUrls(data).filter((u) => !isStored(u) && !isUnavailable(u, fails)); }
  const done = readDone(); return jacketUrls(data).filter((u) => !done.has(key(u)));
};
export const unavailableJackets = (data) => { const fails = read(FAILS, {}); return jacketUrls(data).filter((u) => !isStored(u) && isUnavailable(u, fails)); };

/** Tamanho estimado (bytes) para baixar estas imagens: capas ~30 KB (480 px WebP), o resto ~15 KB. */
export const estimateBytes = (urls) => urls.reduce((b, u) => b + (/\/data\/song_img/.test(u) ? 30_000 : 15_000), 0);

let running = null;
/**
 * Baixa as imagens que faltam, 6 por vez. onProgress(feitas, total).
 * opts.retry: tenta de novo também as indisponíveis.
 */
export function downloadJackets(data, onProgress, opts = {}) {
  if (running) { if (onProgress) running.listeners.add(onProgress); return running.promise; }
  const listeners = new Set(onProgress ? [onProgress] : []);
  const ctl = { stop: false, offline: false };
  let n = 0;
  let total = 0;
  let ok = 0;
  const failed = [];
  const fails = read(FAILS, {});
  const emit = () => listeners.forEach((fn) => fn(n, total));
  const miss = (u, why) => {
    failed.push(why ? `${u} (${why})` : u);
    const f = fails[key(u)] || { n: 0 };
    fails[key(u)] = { n: f.n + 1, at: Date.now() };
  };
  // no app: baixa e salva o arquivo; no site: só aquece o cache do navegador
  const one = (u, done) => (native
    ? saveImg(u).then((saved) => { if (saved) { ok += 1; delete fails[key(u)]; } else miss(u); })
      .catch((e) => { miss(u, e?.message || String(e)); })
    : new Promise((res) => {
      const im = new Image();
      im.referrerPolicy = 'no-referrer';
      im.decoding = 'async';
      const tm = setTimeout(() => { failed.push(`${u} (timeout)`); im.src = ''; res(); }, 20000);
      im.onload = () => { clearTimeout(tm); ok += 1; done.add(key(u)); res(); };
      im.onerror = () => { clearTimeout(tm); failed.push(u); res(); };
      im.src = u;
    }));
  const promise = (async () => {
    const t0 = Date.now();
    if (!navigator.onLine) {
      running = null;
      return { done: 0, total: 0, ok: 0, fail: 0, offline: true };
    }
    if (native) await initImgStore();
    const done = native ? new Set() : readDone();
    const extra = await avatarUrls(data?.version);
    const urls = [...new Set([...jacketUrls(data), ...extra])]
      .filter((u) => (native ? !isStored(u) && (opts.retry || !isUnavailable(u, fails)) : !done.has(key(u))));
    total = urls.length;
    emit();
    const queue = [...urls];
    const worker = async () => {
      while (queue.length && !ctl.stop) {
        if (!navigator.onLine) { ctl.stop = true; ctl.offline = true; break; }
        await one(queue.shift(), done);
        n += 1; emit();
        if (!native && n % 20 === 0) saveDone(done);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (native) write(FAILS, fails); else saveDone(done);
    running = null;
    const res = { at: new Date().toISOString(), total, ok, fail: failed.length, sec: Math.round((Date.now() - t0) / 1000), stopped: ctl.stop && !ctl.offline, offline: ctl.offline };
    write(LAST, res);
    if (total) reportDiag(`imagens: ${ok} ok, ${failed.length} falharam de ${total} em ${res.sec}s`, { ...res, avatars: extra.length, sample: failed.slice(0, 5), online: navigator.onLine, conn: navigator.connection?.effectiveType || null, type: navigator.connection?.type || null });
    return { done: n, ...res };
  })();
  running = { promise, listeners, ctl };
  return promise;
}
export const stopJackets = () => { if (running) running.ctl.stop = true; };
export const jacketsRunning = () => !!running;
/** Depois de apagar as imagens: zera o histórico do download. */
export const resetJacketHistory = () => { try { [DONE, LAST, FAILS].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } };

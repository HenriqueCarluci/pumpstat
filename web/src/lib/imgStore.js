// Imagens guardadas de verdade no aparelho (só no app).
// O cache do navegador do app descarta as imagens da Pump quando quer; aqui cada imagem vira um arquivo
// na pasta do app (Directory.Data/img) e as telas passam a usar o arquivo local.
// O download é nativo (CapacitorHttp), então não depende de CORS nem do cache do WebView.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_URL } from './config.js';

const native = Capacitor.isNativePlatform();
const DIR = 'img';
let base = null;            // endereço local da pasta, já convertido para o WebView
let fs = null;              // { Filesystem, Directory }
const stored = new Set();   // nomes dos arquivos que já estão no aparelho
let ready = null;

/** Nome do arquivo para uma URL: hash estável + extensão. */
export function nameOf(u) {
  const s = String(u).replace(/^https?:\/\//, '').replace(/[?#].*$/, '');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const ext = (s.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'img').toLowerCase();
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}.${ext}`;
}

/** Lê a pasta de imagens uma vez (o app espera isso antes de mostrar as telas). */
export function initImgStore() {
  if (!native) return Promise.resolve();
  if (ready) return ready;
  ready = (async () => {
    try {
      fs = await import('@capacitor/filesystem');
      const { Filesystem, Directory } = fs;
      try {
        const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
        files.forEach((f) => { if ((f.size ?? 1) > 0) stored.add(f.name); });
      } catch { /* pasta ainda não existe */ }
      const { uri } = await Filesystem.getUri({ path: DIR, directory: Directory.Data });
      base = `${Capacitor.convertFileSrc(uri).replace(/\/$/, '')}/`;
    } catch { base = null; }
  })();
  return ready;
}

export const isStored = (u) => !!u && stored.has(nameOf(u));
export const storedCount = () => stored.size;
const remoteOk = (u) => typeof u === 'string' && /^https:\/\//.test(u);

// O piugame.com não envia o certificado intermediário e o Android recusa a conexão
// ("Trust anchor for certification path not found"). No app, as imagens dele passam pelo repasse da nossa API.
const PIU = /^https:\/\/([a-z0-9-]+\.)*piugame\.com\//i;
export const remoteImg = (u) => (native && remoteOk(u) && PIU.test(u) ? `${API_URL}/api/img?u=${encodeURIComponent(u)}` : u);

/** Salva uma imagem no aparelho. Devolve true se ficou salva. */
export async function saveImg(u) {
  if (!native || !remoteOk(u)) return false;
  await initImgStore();
  if (!fs || !base) return false;
  const n = nameOf(u);
  if (stored.has(n)) return true;
  const r = await CapacitorHttp.request({ url: remoteImg(u), method: 'GET', responseType: 'blob', connectTimeout: 15000, readTimeout: 20000 });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
  const data = typeof r.data === 'string' ? r.data.replace(/^data:[^,]*,/, '') : '';
  if (data.length < 40) throw new Error('vazio');
  // só guarda se for mesmo imagem (PNG, JPEG, GIF ou WebP), nunca uma página de erro
  if (!/^(iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)/.test(data)) throw new Error('não é imagem');
  await fs.Filesystem.writeFile({ path: `${DIR}/${n}`, data, directory: fs.Directory.Data, recursive: true });
  stored.add(n);
  return true;
}

// Imagens vistas na tela e que ainda não estão no aparelho: salvam em segundo plano, 3 por vez.
const queue = [];
const queued = new Set();
let active = 0;
function pump() {
  while (active < 3 && queue.length) {
    const u = queue.shift();
    active += 1;
    saveImg(u).catch(() => {}).finally(() => { active -= 1; queued.delete(u); pump(); });
  }
}
function enqueue(u) {
  if (queued.has(u)) return;
  queued.add(u); queue.push(u);
  setTimeout(pump, 1500);
}

/** URL para usar em <img>/background: o arquivo local se já foi baixado; senão a da Pump pelo repasse (e salva em segundo plano). */
export function img(u) {
  if (!u || !native || !remoteOk(u)) return u;
  if (!base) return remoteImg(u);
  const n = nameOf(u);
  if (stored.has(n)) return base + n;
  enqueue(u);
  return remoteImg(u);
}

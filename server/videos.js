// Vídeo exato do YouTube de um chart ou de uma música.
// 1) cache no banco (yt_videos), 2) busca pela YouTube Data API (YOUTUBE_API_KEY) e guarda, 3) sem chave/sem resultado: página de busca.
// A API gratuita dá 10.000 unidades/dia e cada busca custa 100, então limitamos a 90 buscas novas por dia;
// como o resultado fica guardado, cada chart só é buscado uma vez.

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const searchUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

let day = '';
let used = 0;
const inflight = new Map();

export function videoQuery(info) {
  // mesma busca que o app usava antes: "pump it up <música> <S21>" (ou só a música)
  return info.mode ? `pump it up ${info.title} ${info.mode}${info.level}` : `pump it up ${info.title}`;
}

/** Escolhe o melhor resultado: título da música no vídeo e, para chart, o nível certo (S21, Single 21, D 21...). */
export function pickVideo(items, info) {
  const song = norm(info.title);
  const words = song.split(' ').filter((w) => w.length > 1);
  const hasSong = (t) => {
    const n = ` ${norm(t)} `;
    if (n.includes(` ${song} `)) return true;
    const hit = words.filter((w) => n.includes(` ${w} `)).length;
    return words.length > 0 && hit / words.length >= 0.75;
  };
  const lv = info.mode ? new RegExp(`(^|[^a-z0-9])(${info.mode === 'S' ? 's|sp|single' : info.mode === 'D' ? 'd|dp|double' : 'co ?op|coop'})[ ._-]?0?${info.level}([^0-9]|$)`, 'i') : null;
  for (const it of items) {
    const title = it.snippet?.title || '';
    if (!hasSong(title)) continue;
    if (lv && !lv.test(title.replace(/&amp;/g, '&'))) continue;
    return { id: it.id?.videoId, title, channel: it.snippet?.channelTitle || '' };
  }
  return null;
}

export { searchUrl };

export async function resolveVideo({ kind, id, rpc, log = console.log }) {
  const info = await rpc('video_lookup', { p_kind: kind, p_id: id });
  if (!info) return null;
  const q = videoQuery(info);
  const c = info.cached;
  if (c?.video_id) return watchUrl(c.video_id);
  // já buscou e não achou: tenta de novo só depois de 30 dias
  if (c && c.source === 'none' && Date.now() - Date.parse(c.checked_at) < 30 * 86400000) return searchUrl(q);
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return searchUrl(q);
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used >= 90) return searchUrl(q);
  const k = `${kind}:${id}`;
  if (!inflight.has(k)) {
    used++;
    inflight.set(k, (async () => {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${key}`);
      if (!res.ok) { log('youtube', res.status, (await res.text()).slice(0, 200)); return null; }
      const items = (await res.json()).items || [];
      const best = pickVideo(items, info);
      await rpc('video_save', { p_vkey: k, p_video: best?.id || null, p_title: best?.title || null, p_channel: best?.channel || null }).catch((e) => log('video_save', e.message));
      return best?.id || null;
    })().finally(() => setTimeout(() => inflight.delete(k), 1000)));
  }
  const vid = await inflight.get(k).catch(() => null);
  return vid ? watchUrl(vid) : searchUrl(q);
}

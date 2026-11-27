// Acesso ao Supabase (PostgREST RPC) sem SDK: o app só lê, a escrita vem do coletor.
import { accessToken } from './auth.js';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

export { SUPABASE_KEY, SUPABASE_URL };

export async function rpc(fn, args) {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(args || {}),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `Erro ${res.status} em ${fn}`);
  return body;
}

export function clearCache() {
  memo.clear();
  try { Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

const memo = new Map();
const CACHE_PREFIX = 'pumpstat:data:';

// Guarda só UMA versão no aparelho (cada uma tem ~1,4 MB de texto; as duas juntas passavam do limite do Safari
// e tiravam o espaço da sessão de login). Se ainda assim não couber, fica sem cache: os dados vêm da rede.
function store(key, value) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX) && k !== key).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    try { localStorage.removeItem(key); } catch { /* ignora */ }
  }
}
function load(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}

/** Dados de uma versão, transformados em objetos. Usa cache local enquanto busca a versão nova. */
export function cachedVersion(version) {
  const raw = memo.get(version) || load(CACHE_PREFIX + version);
  return raw ? shape(raw) : null;
}

/** Dados de uma versão já buscados nesta sessão (nunca o cache antigo do aparelho). */
export function sessionVersion(version) {
  const raw = memo.get(version);
  return raw ? shape(raw) : null;
}

export async function fetchVersion(version, persist = false) {
  const [raw, community, fresh, ref, tags] = await Promise.all([
    rpc('app_data', { p_version: version }),
    rpc('community_charts', { p_version: version }).catch(() => []),
    rpc('new_songs', { p_version: version }).catch(() => []),
    rpc('chart_ref_tiers', { p_version: version }).catch(() => []),
    rpc('chart_ref_tags', { p_version: version }).catch(() => []),
  ]);
  raw.community = community;
  raw.new_songs = fresh;
  raw.ref = ref;
  raw.tags = tags;
  memo.set(version, raw);
  if (persist) store(CACHE_PREFIX + version, raw);
  return shape(raw);
}

/** Modo visitante: só o catálogo (tier e tags), sem login. */
export async function fetchGuest(version) {
  const raw = await rpc('guest_data', { p_version: version });
  return shape(raw);
}

function shape(raw) {
  const songs = new Map();
  for (const [id, title, artist, bpm, songType, jacket, rise] of raw.songs || []) {
    songs.set(id, { id, title, artist, bpm, songType, jacket, rise: !!rise, charts: [] });
  }
  const charts = [];
  const byId = new Map();
  for (const r of raw.charts || []) {
    const c = {
      id: r[0], songId: r[1], mode: r[2], level: r[3], stepArtist: r[4], notes: r[5], skills: r[6] || [],
      passDifficulty: r[7], scoreDifficulty: r[8], scoringLevel: r[9] == null ? null : Number(r[9]),
      score: r[10], grade: r[11], plate: r[12], achievedAt: r[13],
      otherScore: r[14], otherGrade: r[15], otherPlate: r[16], broken: !!r[17],
    };
    const s = songs.get(c.songId);
    if (!s) continue;
    c.song = s;
    s.charts.push(c);
    charts.push(c);
    byId.set(c.id, c);
  }
  for (const [chartId, avg, votes, tags, club, special] of raw.community || []) {
    const c = byId.get(chartId);
    if (!c) continue;
    c.community = { avg: avg == null ? null : Number(avg), votes, tags: tags || [], club: club == null ? null : Number(club) };
    if (special && (special.gimmick || special.off)) {
      c.special = { g: special.g || [], gimmick: !!special.gimmick, off: !!special.off, note: special.note || null, admin: !!special.admin };
    }
  }
  // faixa de tier de referência (ArcadeStat)
  for (const [chartId, band] of raw.ref || []) { const c = byId.get(chartId); if (c) c.ref = band; }
  // tags de referência (ArcadeStat)
  for (const [chartId, tags, scores, edited] of raw.tags || []) {
    const c = byId.get(chartId);
    if (!c) continue;
    c.tags = tags || [];
    c.tagsEdited = !!edited;
    // barrinhas de skill (peso 0–100 das tags mais votadas no ArcadeStat)
    const bars = Object.entries(scores || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (bars.length) c.tagBars = bars;
  }
  // músicas novas da versão (não estavam na anterior)
  for (const id of raw.new_songs || []) { const s = songs.get(id); if (s) s.isNew = true; }
  for (const s of songs.values()) {
    s.charts.sort((a, b) => order(a) - order(b));
    // Half-Double só existe no canal R!SE MIX (conta Steam ligada)
    s.hasHD = s.charts.some((c) => c.mode === 'HD');
    s.played = s.charts.some((c) => c.score != null);
  }
  const plays = (raw.plays || []).map((p) => ({
    chart: byId.get(p[0]), score: p[1], grade: p[2], plate: p[3],
    perfect: p[4], great: p[5], good: p[6], bad: p[7], miss: p[8], playedAt: p[9], broken: !!p[10],
  })).filter((p) => p.chart);
  return {
    version: raw.version,
    songs: [...songs.values()].filter((s) => s.charts.length),
    charts,
    byId,
    plays,
    profile: raw.profile,
    lastSync: raw.last_sync,
    pumbilityHistory: raw.pumbility_history || [],
  };
}
const order = (c) => ({ S: 0, D: 1000, HD: 2000, C: 3000 })[c.mode] + c.level;

export const chartHistory = (chartId) => rpc('chart_history', { p_chart_id: chartId });

// dados do Progresso (jogadas, recordes e estilos), guardados na memória durante a sessão
// (`stamp` = horário do último sync: mudou, busca de novo)
const progCache = new Map();
export function loadProgress(version, stamp = null) {
  const hit = progCache.get(version);
  if (hit && (stamp == null || hit.stamp === stamp)) return hit.p;
  const p = rpc('my_progress', { p_version: version }).catch((e) => { progCache.delete(version); throw e; });
  progCache.set(version, { p, stamp });
  return p;
}

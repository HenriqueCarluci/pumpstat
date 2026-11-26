// Acesso ao Supabase (PostgREST RPC) sem SDK: o app só lê, a escrita vem do coletor.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jujbkgzkenktjuurrwvo.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_8_e3UpVPrgDdQbNlFitBvw_9uSoJG_t';

export async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `Erro ${res.status} em ${fn}`);
  return body;
}

const memo = new Map();
const CACHE_PREFIX = 'pumpstat:data:';

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível ou cheio */ }
}
function load(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}

/** Dados de uma versão, transformados em objetos. Usa cache local enquanto busca a versão nova. */
export function cachedVersion(version) {
  const raw = memo.get(version) || load(CACHE_PREFIX + version);
  return raw ? shape(raw) : null;
}

export async function fetchVersion(version) {
  const raw = await rpc('app_data', { p_version: version });
  memo.set(version, raw);
  store(CACHE_PREFIX + version, raw);
  return shape(raw);
}

function shape(raw) {
  const songs = new Map();
  for (const [id, title, artist, bpm, songType, jacket] of raw.songs || []) {
    songs.set(id, { id, title, artist, bpm, songType, jacket, charts: [] });
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
  for (const s of songs.values()) {
    s.charts.sort((a, b) => order(a) - order(b));
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
const order = (c) => ({ S: 0, D: 1000, C: 2000 })[c.mode] + c.level;

export const chartHistory = (chartId) => rpc('chart_history', { p_chart_id: chartId });

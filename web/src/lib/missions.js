// Gamificação semanal: missões personalizadas, sequência de semanas jogadas e resumo da semana passada.
// Semana = segunda a domingo. As missões são geradas a partir do histórico do jogador na primeira abertura da semana
// e ficam congeladas no servidor (user_week_missions): a meta e os charts citados não mudam no meio da semana.
// O progresso é calculado das jogadas sincronizadas. A configuração vem do admin (app_config.missions).
import { styleOf } from './insights.js';
import { chartTier, nextGrade, PLATE_ORDER, pumbilitySuggestions } from './piu.js';
import { hasGimmick } from './special.js';
import { entitlements } from './plans.js';

const DAY = 86400000;
const WEEK = 7 * DAY;

/** Segunda-feira 00:00 (horário do aparelho) da semana de `ts`. */
export function weekStart(ts = Date.now()) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
/** yyyy-mm-dd da segunda-feira (chave da semana no servidor). */
export function weekKey(ws = weekStart()) {
  const d = new Date(ws);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const weekFromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

// ---------- catálogo ----------
// tier: fácil (hábito), médio, desafio e bônus. cat: usado pelo foco da semana.
export const MISSION_TYPES = [
  { id: 'days', tier: 'easy', cat: 'habit', label: 'Dias jogados' },
  { id: 'plays', tier: 'easy', cat: 'habit', label: 'Jogadas' },
  { id: 'explore', tier: 'easy', cat: 'habit', label: 'Charts que nunca jogou' },
  { id: 'checkin', tier: 'easy', cat: 'social', label: 'Check-in na fila do fliperama' },
  { id: 'clear_prev', tier: 'medium', cat: 'level', label: 'Passar charts novos (nível abaixo do alvo)' },
  { id: 'improve', tier: 'medium', cat: 'score', label: 'Melhorar recordes' },
  { id: 'grade_up', tier: 'medium', cat: 'score', label: 'Chegar à próxima nota (chart nomeado)' },
  { id: 'plate_up', tier: 'medium', cat: 'score', label: 'Melhorar a plate (chart nomeado)' },
  { id: 'pumbility', tier: 'medium', cat: 'score', label: 'Subir PUMBILITY (chart nomeado)' },
  { id: 'weak', tier: 'medium', cat: 'weak', label: 'Ponto fraco (tags do ArcadeStat)' },
  { id: 'training', tier: 'medium', cat: 'weak', label: 'Meu treino' },
  { id: 'friend_chart', tier: 'medium', cat: 'social', label: 'Chart que um amigo jogou na semana' },
  { id: 'clear_target', tier: 'hard', cat: 'level', label: 'Passar chart novo no nível alvo' },
  { id: 'near_clear', tier: 'hard', cat: 'level', label: 'Quase passou (chart nomeado)' },
  { id: 'rival_clear', tier: 'hard', cat: 'social', label: 'Chart que o rival passou' },
  { id: 'event', tier: 'bonus', cat: 'event', label: 'Evento do admin' },
  { id: 'new_songs', tier: 'bonus', cat: 'event', label: 'Músicas novas da Phoenix 2' },
  { id: 'gimmick', tier: 'bonus', cat: 'fun', label: 'Charts com gimmick' },
];
const TYPE = Object.fromEntries(MISSION_TYPES.map((x) => [x.id, x]));
export const TIERS = [['easy', 'Fácil'], ['medium', 'Médio'], ['hard', 'Desafio'], ['bonus', 'Bônus']];
export const FOCUS = [
  ['auto', 'Automático', 'Um pouco de tudo, do jeito que você vem jogando'],
  ['level', 'Subir de nível', 'Mais charts novos no seu nível e os que quase passou'],
  ['score', 'Melhorar notas', 'Próxima nota, plate e PUMBILITY'],
  ['weak', 'Ponto fraco', 'Seu padrão mais fraco e o Meu treino'],
  ['fun', 'Só diversão', 'Sem desafio pesado: explorar, amigos, gimmick e eventos'],
];
const FOCUS_MUL = {
  auto: {},
  level: { level: 3, score: 0.6, fun: 0.5 },
  score: { score: 3, level: 0.6, fun: 0.5 },
  weak: { weak: 3, level: 0.8, fun: 0.5 },
  fun: { habit: 1.5, social: 2, fun: 3, event: 2, level: 0.3, score: 0.6 },
};

export const MISSION_DEFAULTS = {
  types: {},                                  // id -> { on, w }
  slots: { easy: 1, medium: 2, hard: 1 },
  bonus_pct: 50,
  lookback: 6, stretch: 15, ease: 20, harder: 15,
  badges: true,
  points: true, points_by: { easy: 10, medium: 20, hard: 40, bonus: 30, week: 50 },
  rerolls: 1, focus: true, focus_changes: 1, no_repeat: true, event_always: true,
  week_marks: [1, 5, 10, 25, 50], streak_marks: [4, 8, 12, 26, 52],
  week_names: {}, streak_names: {},
  events: [],
};
/** Composição da semana para N missões (limite do plano). */
export function slotsFor(n) {
  if (n <= 2) return { slots: { easy: n, medium: 0, hard: 0 }, bonus: false };
  if (n === 3) return { slots: { easy: 1, medium: 2, hard: 0 }, bonus: false };
  if (n === 4) return { slots: { easy: 1, medium: 2, hard: 1 }, bonus: false };
  return { slots: { easy: 1, medium: 2, hard: 1 }, bonus: true };
}

export function missionConfig(plan) {
  const c = plan?.config?.missions || {};
  const cfg = { ...MISSION_DEFAULTS, ...c, slots: { ...MISSION_DEFAULTS.slots, ...(c.slots || {}) }, points_by: { ...MISSION_DEFAULTS.points_by, ...(c.points_by || {}) }, types: c.types || {} };
  // com a cobrança ligada, o plano decide quantas missões, as trocas e o foco
  const ent = entitlements(plan);
  const n = ent.limit('missions');
  if (n != null) {
    const s = slotsFor(Math.max(1, n));
    cfg.slots = s.slots;
    cfg.bonus_pct = s.bonus ? 100 : 0;
    cfg.event_always = s.bonus ? cfg.event_always : false;
  }
  const r = ent.limit('mission_rerolls');
  if (r != null) cfg.rerolls = r;
  if (!ent.can('missions_focus')) cfg.focus = false;
  return cfg;
}
const typeOn = (cfg, id) => cfg.types[id]?.on !== false;
// o foco "Melhorar notas" só aparece se algum tipo de missão de nota estiver ligado
export const focusOptions = (cfg) => FOCUS.filter(([id]) => id !== 'score' || MISSION_TYPES.some((x) => x.cat === 'score' && typeOn(cfg, x.id)));
/** Pontuação do app ligada pelo admin, e quantos pontos vale cada missão completa. */
export const pointsOn = (cfg) => cfg.points !== false;
export const pointsFor = (cfg, tier) => Number(cfg.points_by?.[tier] ?? MISSION_DEFAULTS.points_by[tier] ?? 0);
const typeW = (cfg, id) => Math.max(0, Number(cfg.types[id]?.w ?? 1));

/** Nome do selo (o admin pode renomear). */
export function badgeName(cfg, badge, level, t) {
  const custom = (badge === 'weeks' ? cfg.week_names : cfg.streak_names)?.[level];
  if (custom) return custom;
  return badge === 'weeks'
    ? (level === 1 ? t('Primeira semana completa') : t('{n} semanas completas', { n: level }))
    : t('Sequência de {n} semanas', { n: level });
}

// ---------- utilidades ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
export function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TIER_ORDER = { fundo: 0, baixo: 1, medio_baixo: 2, medio: 3, unknown: 3.5, medio_alto: 4, alto: 5, topo: 6 };
const easierFirst = (a, b) => TIER_ORDER[chartTier(a)] - TIER_ORDER[chartTier(b)] || (a.scoringLevel ?? 99) - (b.scoringLevel ?? 99);
const sd = (c) => c.mode === 'S' || c.mode === 'D';

function weakOf(weak) {
  return (weak || []).find((w) => w.index >= 6 && w.confidence !== 'low')?.id || (weak || []).find((w) => !w.neutral && w.index > 0)?.id || null;
}
function heavy(prog, cache, c, p) {
  const k = `${c.id}:${p}`;
  if (!cache.has(k)) cache.set(k, (styleOf(prog, c)?.pct[p] || 0) >= 20);
  return cache.get(k);
}

/** Primeira vez que cada chart apareceu no histórico (jogada, recorde ou primeiro registro). */
function firstSeenMap(prog) {
  const m = new Map();
  const put = (id, at) => { if (at && (!m.has(id) || at < m.get(id))) m.set(id, at); };
  for (const p of prog.plays) put(p.chart.id, p.at);
  for (const h of prog.history) put(h.chart.id, h.at);
  for (const [id, f] of prog.firsts || []) put(id, f.firstSeen || f.achieved);
  return m;
}

/** Números de cada semana anterior (para calibrar as metas pelo próprio histórico). */
function weeklyStats(ctx, n) {
  const { prog, attempts, mode, lvl, ws } = ctx;
  const idx = (at) => Math.round((ws - weekStart(at)) / WEEK); // 1 = semana passada
  const weeks = Array.from({ length: n + 1 }, () => ({ plays: 0, days: new Set(), improved: new Set(), clears: 0, weak: 0, training: 0, explore: 0, newSongs: 0 }));
  const inRange = (i) => i >= 1 && i <= n;
  const weakP = weakOf(ctx.weak);
  const pool = new Set(ctx.training || []);
  const first = firstSeenMap(prog);
  for (const p of prog.plays) {
    const i = idx(p.at);
    if (!inRange(i)) continue;
    const w = weeks[i];
    w.plays++; w.days.add(dayKey(p.at));
    if (weakP && p.chart.mode === mode && heavy(prog, ctx.heavyCache, p.chart, weakP)) w.weak++;
    if (pool.has(p.chart.id)) w.training++;
    if (p.chart.song?.isNew) w.newSongs++;
  }
  for (const [id, at] of first) { const i = idx(at); if (inRange(i) && ctx.data.byId.get(id)) weeks[i].explore++; }
  const best = new Map();
  for (const h of [...prog.history].sort((a, b) => a.at - b.at)) {
    if (h.broken) continue;
    const prev = best.get(h.chart.id);
    const i = idx(h.at);
    if (inRange(i) && h.chart.mode === mode && prev != null && h.score > prev) weeks[i].improved.add(h.chart.id);
    best.set(h.chart.id, Math.max(prev || 0, h.score));
  }
  if (lvl) {
    for (const a of attempts) {
      if (a.chart.mode !== mode || !a.firstClear || a.chart.level < lvl.target - 1) continue;
      const i = idx(a.firstClear);
      if (inRange(i)) weeks[i].clears++;
    }
  }
  const active = weeks.slice(1).filter((w) => w.plays > 0);
  if (active.length < 2) return null;
  const m = (f) => median(active.map(f));
  return {
    weeks: active.length, plays: m((w) => w.plays), days: m((w) => w.days.size), improved: m((w) => w.improved.size),
    clears: m((w) => w.clears), weak: m((w) => w.weak), training: m((w) => w.training), explore: m((w) => w.explore), newSongs: m((w) => w.newSongs),
  };
}

/** Ajuste automático: alivia depois de 2 semanas fracas, aperta depois de uma semana fechada em até 4 dias. */
export function adjustFactor(past, cfg) {
  const [a, b] = past || [];
  const weak = (r) => r && r.total > 0 && r.done / r.total < 0.5;
  if (weak(a) && weak(b)) return { f: 1 - cfg.ease / 100, why: 'ease' };
  if (a?.completed_at && a.week && Date.parse(a.completed_at) - weekFromKey(a.week) < 4 * DAY) return { f: 1 + cfg.harder / 100, why: 'harder' };
  return { f: 1, why: null };
}

// ---------- geradores ----------
// Cada gerador devolve a definição da missão (congelada) ou null quando não se aplica a esta pessoa.
function goalOf(ctx, base, def, lo, hi) {
  if (base == null) return def;
  const g = Math.round(base * (1 + ctx.cfg.stretch / 100) * ctx.adj);
  return clamp(Math.max(g, lo), lo, hi);
}
const chartsOf = (ctx, pred) => ctx.data.charts.filter((c) => sd(c) && pred(c));
const take = (ctx, list, n) => { const out = []; for (const c of list) { if (out.length >= n) break; if (!ctx.used.has(c.id)) { out.push(c); ctx.used.add(c.id); } } return out; };

const GEN = {
  days(ctx) { const n = goalOf(ctx, ctx.base?.days, 2, 1, 6); return { goal: n, vars: { n } }; },
  plays(ctx) {
    let n = goalOf(ctx, ctx.base?.plays, 10, 5, 80);
    if (n > 20) n = Math.round(n / 5) * 5;
    return { goal: n, vars: { n } };
  },
  explore(ctx) { const n = goalOf(ctx, ctx.base?.explore, 3, 2, 10); return { goal: n, vars: { n } }; },
  checkin(ctx) { if (!ctx.social?.visited) return null; return { goal: 1, vars: { n: 1 } }; },
  clear_prev(ctx) {
    const { lvl, mode } = ctx;
    if (!lvl || lvl.target - 1 < 1) return null;
    const L = lvl.target - 1;
    const open = chartsOf(ctx, (c) => c.mode === mode && c.level === L && !ctx.cleared.has(c.id)).sort(easierFirst);
    if (!open.length) return null;
    const n = Math.min(open.length, goalOf(ctx, ctx.base?.clears, 2, 1, 5));
    return { goal: n, vars: { n, m: mode, L }, charts: take(ctx, open, 3).map((c) => c.id) };
  },
  clear_target(ctx) {
    const { lvl, mode } = ctx;
    if (!lvl) return null;
    const L = lvl.target;
    const open = chartsOf(ctx, (c) => c.mode === mode && c.level === L && !ctx.cleared.has(c.id)).sort(easierFirst);
    if (!open.length) return null;
    const n = (ctx.base?.clears || 0) >= 4 && open.length >= 2 ? 2 : 1;
    return { goal: n, vars: { n, m: mode, L }, charts: take(ctx, open, 3).map((c) => c.id) };
  },
  near_clear(ctx) {
    const { lvl, mode } = ctx;
    if (!lvl) return null;
    const list = ctx.attempts.filter((a) => a.chart.mode === mode && !a.cleared && a.fails >= 1
        && a.chart.level >= lvl.target - 2 && a.chart.level <= lvl.target + 1)
      .sort((a, b) => (a.chart.level - b.chart.level) || (b.fails - a.fails) || easierFirst(a.chart, b.chart)).map((a) => a.chart);
    const pick = take(ctx, list, 2);
    if (!pick.length) return null;
    const fails = Object.fromEntries(pick.map((c) => [c.id, ctx.attempts.find((a) => a.chart.id === c.id)?.fails || 1]));
    return { goal: 1, vars: { n: fails[pick[0].id] }, charts: pick.map((c) => c.id), meta: { fails } };
  },
  improve(ctx) { const n = goalOf(ctx, ctx.base?.improved, 3, 1, 8); return { goal: n, vars: { n } }; },
  grade_up(ctx) {
    const { lvl, mode, version } = ctx;
    const lo = lvl ? lvl.comfort - 3 : 10;
    const list = chartsOf(ctx, (c) => c.mode === mode && c.score != null && !c.broken && c.level >= lo && (!lvl || c.level <= lvl.ceiling))
      .map((c) => ({ c, nx: nextGrade(version, c.score) }))
      .filter((x) => x.nx && x.nx.need <= 25000 && x.nx.min >= 800000)
      .sort((a, b) => a.nx.need / (a.c.level + 5) - b.nx.need / (b.c.level + 5));
    const pick = take(ctx, list.map((x) => x.c), 3);
    if (!pick.length) return null;
    const targets = pick.map((c) => { const nx = nextGrade(version, c.score); return { id: c.id, g: nx.grade, s: nx.min }; });
    return { goal: 1, vars: {}, charts: pick.map((c) => c.id), targets };
  },
  plate_up(ctx) {
    const { lvl, mode } = ctx;
    const lo = lvl ? lvl.comfort - 4 : 8;
    const list = chartsOf(ctx, (c) => c.mode === mode && !c.broken && c.plate && c.level >= lo && (!lvl || c.level <= lvl.comfort + 1)
        && ['SG', 'MG', 'TG', 'FG', 'EG'].includes(c.plate))
      .sort((a, b) => PLATE_ORDER.indexOf(a.plate) - PLATE_ORDER.indexOf(b.plate) || a.level - b.level);
    const pick = take(ctx, list, 3);
    if (!pick.length) return null;
    const targets = pick.map((c) => ({ id: c.id, from: c.plate, p: PLATE_ORDER[PLATE_ORDER.indexOf(c.plate) - 1] }));
    return { goal: 1, vars: {}, charts: pick.map((c) => c.id), targets };
  },
  pumbility(ctx) {
    const ideas = pumbilitySuggestions(ctx.version, ctx.data.charts, 12).filter((x) => x.chart && x.kind === 'grade');
    const pick = take(ctx, ideas.map((x) => x.chart), 3);
    if (!pick.length) return null;
    const targets = pick.map((c) => { const x = ideas.find((i) => i.chart.id === c.id); return { id: c.id, g: x.grade, s: c.score + x.need, gain: Math.round(x.gain * 10) / 10 }; });
    return { goal: 1, vars: {}, charts: pick.map((c) => c.id), targets };
  },
  weak(ctx) {
    const { lvl, mode, prog } = ctx;
    const p = weakOf(ctx.weak);
    if (!lvl || !p) return null;
    const list = chartsOf(ctx, (c) => c.mode === mode && c.level >= lvl.comfort - 1 && c.level <= lvl.target && heavy(prog, ctx.heavyCache, c, p))
      .sort((a, b) => (styleOf(prog, b).pct[p] - styleOf(prog, a).pct[p]) || (a.level - b.level));
    if (list.length < 2) return null;
    const n = goalOf(ctx, ctx.base?.weak, 4, 2, 8);
    return { goal: n, vars: { n, p }, charts: take(ctx, list, 3).map((c) => c.id) };
  },
  training(ctx) {
    const pool = (ctx.training || []).filter((id) => ctx.data.byId.has(id));
    if (!pool.length) return null;
    const n = Math.min(Math.max(pool.length, 2), goalOf(ctx, ctx.base?.training, 3, 2, 6));
    const order = pool.map((id) => ctx.data.byId.get(id)).sort((a, b) => Number(ctx.cleared.has(a.id)) - Number(ctx.cleared.has(b.id)) || easierFirst(a, b));
    return { goal: n, vars: { n }, charts: take(ctx, order, 3).map((c) => c.id), pool: pool.slice(0, 60) };
  },
  friend_chart(ctx) {
    if (!ctx.social?.friend_count) return null;
    const n = ctx.social.friend_count >= 3 ? 2 : 1;
    return { goal: n, vars: { n } };
  },
  rival_clear(ctx) {
    const { lvl, mode } = ctx;
    const r = ctx.social?.rival;
    if (!lvl || !r?.cleared?.length) return null;
    const theirs = new Set(r.cleared);
    const list = chartsOf(ctx, (c) => c.mode === mode && theirs.has(c.id) && !ctx.cleared.has(c.id) && c.level >= lvl.target - 2 && c.level <= lvl.target)
      .sort((a, b) => b.level - a.level || easierFirst(a, b));
    const pick = take(ctx, list, 3);
    if (!pick.length) return null;
    return { goal: 1, vars: { r: r.nickname || '' }, charts: pick.map((c) => c.id) };
  },
  event(ctx) {
    const ev = activeEvents(ctx.cfg, ctx.ws)[0];
    if (!ev) return null;
    const songs = ev.kind === 'new_songs' ? null : new Set(ev.songs || []);
    const inEv = (c) => (songs ? songs.has(c.songId) : !!c.song?.isNew);
    const lvl = ctx.lvl;
    const sug = chartsOf(ctx, (c) => inEv(c) && (!lvl || (c.level >= lvl.comfort - 4 && c.level <= lvl.target))).sort(easierFirst);
    const n = clamp(Number(ev.goal) || 3, 1, 50);
    return { goal: n, vars: { n, title: ev.title || '' }, charts: take(ctx, sug, 3).map((c) => c.id),
      ev: { id: ev.id, kind: ev.kind || 'songs', measure: ev.measure || 'plays', songs: songs ? [...songs] : null, start: ev.start || null, end: ev.end || null } };
  },
  new_songs(ctx) {
    if (ctx.version !== 'phoenix2') return null;
    const lvl = ctx.lvl;
    const list = chartsOf(ctx, (c) => c.song?.isNew && (!lvl || (c.level >= lvl.comfort - 4 && c.level <= lvl.target))).sort(easierFirst);
    if (list.length < 3) return null;
    const n = goalOf(ctx, ctx.base?.newSongs, 3, 2, 6);
    return { goal: n, vars: { n }, charts: take(ctx, list, 3).map((c) => c.id) };
  },
  gimmick(ctx) {
    const lvl = ctx.lvl;
    const list = chartsOf(ctx, (c) => hasGimmick(c) && (!lvl || c.level <= lvl.comfort + 1) && c.level >= 5).sort(easierFirst);
    if (list.length < 3) return null;
    return { goal: 2, vars: { n: 2 }, charts: take(ctx, list, 3).map((c) => c.id) };
  },
};

export function activeEvents(cfg, ws) {
  const we = ws + WEEK;
  return (cfg.events || []).filter((e) => e && e.on !== false && (!e.start || Date.parse(e.start) < we) && (!e.end || Date.parse(e.end) > ws));
}

/** Contexto comum: o que é preciso para gerar e para calcular o progresso. */
export function missionCtx({ data, version, prog, attempts, mode, lvl, weak, training, social, past, cfg, ws = weekStart() }) {
  const ctx = { data, version, prog, attempts, mode, lvl, weak, training, social, past: past || [], cfg, ws, heavyCache: new Map() };
  ctx.cleared = new Set(attempts.filter((a) => a.cleared).map((a) => a.chart.id));
  return ctx;
}

function build(ctx, type, used) {
  const g = GEN[type];
  if (!g) return null;
  ctx.used = new Set(used);
  const d = g(ctx);
  if (!d) return null;
  return { type, tier: TYPE[type].tier, ...d };
}

/**
 * Monta as missões da semana. Determinístico pela semente (pessoa + semana + foco).
 * Composição pelos slots do admin; o foco pesa as categorias; tipos da semana passada pesam menos (sem repetir).
 */
export function generateMissions(ctx, { focus = 'auto', seed = 1 } = {}) {
  const cfg = ctx.cfg;
  const r = rng(seed);
  ctx.base = weeklyStats(ctx, clamp(Number(cfg.lookback) || 6, 2, 12));
  ctx.adj = adjustFactor(ctx.past, cfg).f;
  const last = new Set(cfg.no_repeat ? ctx.past[0]?.types || [] : []);
  const mul = FOCUS_MUL[focus] || {};
  const slots = { ...cfg.slots };
  let bonusPct = Number(cfg.bonus_pct) || 0;
  if (focus === 'fun') { slots.medium = (slots.medium || 0) + (slots.hard || 0); slots.hard = 0; bonusPct = 100; }
  const order = [...Array(slots.easy || 0).fill('easy'), ...Array(slots.medium || 0).fill('medium'), ...Array(slots.hard || 0).fill('hard')].slice(0, 7);
  const out = [];
  const usedCharts = new Set();
  const taken = new Set();
  const fallback = { hard: ['hard', 'medium', 'easy'], medium: ['medium', 'easy'], easy: ['easy', 'medium'], bonus: ['bonus'] };

  const pickIn = (tiers) => {
    for (const tier of tiers) {
      const cands = [];
      for (const x of MISSION_TYPES) {
        if (x.tier !== tier || taken.has(x.id) || !typeOn(cfg, x.id) || x.id === 'event') continue;
        const w = typeW(cfg, x.id) * (mul[x.cat] ?? 1) * (last.has(x.id) ? 0.15 : 1);
        if (w <= 0) continue;
        const d = build(ctx, x.id, usedCharts);
        if (d) cands.push([d, w]);
      }
      if (!cands.length) continue;
      let v = r() * cands.reduce((s, [, w]) => s + w, 0);
      for (const [d, w] of cands) { v -= w; if (v <= 0) return d; }
      return cands[cands.length - 1][0];
    }
    return null;
  };
  const add = (d) => { if (!d) return; out.push(d); taken.add(d.type); (d.charts || []).forEach((id) => usedCharts.add(id)); };

  for (const tier of order) add(pickIn(fallback[tier]));
  // bônus: evento ativo do admin entra sempre (se ligado); senão, sorteio pela chance de bônus
  const ev = typeOn(cfg, 'event') ? build(ctx, 'event', usedCharts) : null;
  if (ev && (cfg.event_always || r() * 100 < bonusPct)) add(ev);
  else if (r() * 100 < bonusPct) add(pickIn(['bonus']));
  if (!out.length) add(build(ctx, 'plays', usedCharts));
  return out.slice(0, 8);
}

/** Troca uma missão por outra do mesmo nível de dificuldade (ou de outro, se não houver). */
export function rerollMission(ctx, defs, index, { focus = 'auto', seed = 1 } = {}) {
  const cfg = ctx.cfg;
  const r = rng(seed);
  if (!ctx.base) ctx.base = weeklyStats(ctx, clamp(Number(cfg.lookback) || 6, 2, 12));
  if (ctx.adj == null) ctx.adj = adjustFactor(ctx.past, cfg).f;
  const cur = defs[index];
  const taken = new Set(defs.map((d) => d.type));
  const usedCharts = new Set(defs.filter((_, i) => i !== index).flatMap((d) => d.charts || []));
  (cur.charts || []).forEach((id) => usedCharts.add(id));
  const mul = FOCUS_MUL[focus] || {};
  const tiers = cur.tier === 'bonus' ? ['bonus', 'medium', 'easy'] : [cur.tier, ...['medium', 'easy', 'hard'].filter((x) => x !== cur.tier)];
  for (const tier of tiers) {
    const cands = [];
    for (const x of MISSION_TYPES) {
      if (x.tier !== tier || taken.has(x.id) || !typeOn(cfg, x.id) || x.id === 'event') continue;
      const w = typeW(cfg, x.id) * (mul[x.cat] ?? 1);
      if (w <= 0) continue;
      const d = build(ctx, x.id, usedCharts);
      if (d) cands.push([d, w]);
    }
    if (!cands.length) continue;
    let v = r() * cands.reduce((s, [, w]) => s + w, 0);
    let pick = cands[cands.length - 1][0];
    for (const [d, w] of cands) { v -= w; if (v <= 0) { pick = d; break; } }
    return defs.map((d, i) => (i === index ? pick : d));
  }
  return null;
}

// ---------- progresso ----------
/** Progresso de cada missão na semana `ctx.ws`, a partir das jogadas sincronizadas. */
export function missionProgress(defs, ctx) {
  const { prog, attempts, mode, ws } = ctx;
  const we = ws + WEEK;
  const inWeek = (t) => t >= ws && t < we;
  const plays = prog.plays.filter((p) => inWeek(p.at));
  const hist = prog.history.filter((h) => inWeek(h.at) && !h.broken);
  const firstClear = new Map(attempts.filter((a) => a.firstClear && inWeek(a.firstClear)).map((a) => [a.chart.id, a]));
  const bestInWeek = new Map();
  for (const h of hist) bestInWeek.set(h.chart.id, Math.max(bestInWeek.get(h.chart.id) || 0, h.score));
  for (const p of plays) if (!p.broken && p.score != null) bestInWeek.set(p.chart.id, Math.max(bestInWeek.get(p.chart.id) || 0, p.score));
  let first = null;
  const firstSeen = () => { if (!first) first = firstSeenMap(prog); return first; };
  const friends = new Map((ctx.social?.friends || []).map(([id, nick]) => [id, nick]));

  const cur = (d) => {
    switch (d.type) {
      case 'days': return new Set(plays.map((p) => dayKey(p.at))).size;
      case 'plays': return plays.length;
      case 'explore': { const f = firstSeen(); return new Set(plays.filter((p) => inWeek(f.get(p.chart.id) ?? p.at)).map((p) => p.chart.id)).size; }
      case 'checkin': return Number(ctx.social?.checkins || 0);
      case 'clear_prev': case 'clear_target':
        return [...firstClear.values()].filter((a) => a.chart.mode === d.vars.m && a.chart.level === d.vars.L).length;
      case 'near_clear': case 'rival_clear':
        return (d.charts || []).filter((id) => firstClear.has(id)).length;
      case 'improve': {
        const before = new Map();
        const improved = new Set();
        for (const h of [...prog.history].sort((a, b) => a.at - b.at)) {
          if (h.chart.mode !== mode || h.broken) continue;
          const prev = before.get(h.chart.id);
          if (h.at < ws) { before.set(h.chart.id, Math.max(prev || 0, h.score)); continue; }
          if (inWeek(h.at) && prev != null && h.score > prev) improved.add(h.chart.id);
        }
        return improved.size;
      }
      case 'grade_up': case 'pumbility':
        return (d.targets || []).filter((x) => (bestInWeek.get(x.id) || 0) >= x.s).length;
      case 'plate_up':
        return (d.targets || []).filter((x) => hist.some((h) => h.chart.id === x.id && h.plate && PLATE_ORDER.indexOf(h.plate) >= 0
          && PLATE_ORDER.indexOf(h.plate) <= PLATE_ORDER.indexOf(x.p))).length;
      case 'weak': {
        const p = d.vars.p;
        return plays.filter((x) => x.chart.mode === mode && heavy(prog, ctx.heavyCache, x.chart, p)).length;
      }
      case 'training': { const pool = new Set(d.pool || d.charts || []); return plays.filter((p) => pool.has(p.chart.id)).length; }
      case 'friend_chart': return new Set(plays.filter((p) => friends.has(p.chart.id)).map((p) => p.chart.id)).size;
      case 'event': {
        const e = d.ev || {};
        const songs = e.songs ? new Set(e.songs) : null;
        const lo = e.start ? Date.parse(e.start) : -Infinity, hi = e.end ? Date.parse(e.end) : Infinity;
        const ok = (p) => p.at >= lo && p.at < hi && (songs ? songs.has(p.chart.songId) : !!p.chart.song?.isNew);
        const ps = plays.filter(ok);
        return e.measure === 'clears' ? new Set(ps.filter((p) => !p.broken).map((p) => p.chart.id)).size : ps.length;
      }
      case 'new_songs': return plays.filter((p) => p.chart.song?.isNew).length;
      case 'gimmick': return plays.filter((p) => hasGimmick(p.chart)).length;
      default: return 0;
    }
  };
  return defs.map((d) => {
    const c = cur(d);
    return { ...d, cur: Math.min(c, d.goal), done: c >= d.goal };
  });
}

/** Charts de amigos desta semana para mostrar na missão social (os que você ainda não jogou na semana). */
export function friendSuggestions(ctx, n = 3) {
  const played = new Set(ctx.prog.plays.filter((p) => p.at >= ctx.ws).map((p) => p.chart.id));
  const lvl = ctx.lvl;
  return (ctx.social?.friends || []).map(([id, nick]) => ({ c: ctx.data.byId.get(id), nick }))
    .filter((x) => x.c && sd(x.c) && !played.has(x.c.id) && (!lvl || (x.c.level >= lvl.comfort - 4 && x.c.level <= lvl.target + 1)))
    .sort((a, b) => (lvl ? Math.abs(a.c.level - lvl.comfort) - Math.abs(b.c.level - lvl.comfort) : 0))
    .slice(0, n);
}

/** Sequência de semanas com jogo, a partir das semanas (datas yyyy-mm-dd de segunda) vindas do servidor. */
export function weekStreak(weeks, current) {
  const set = new Set(weeks || []);
  const shift = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const playedNow = set.has(current);
  let start = playedNow ? current : shift(current, -7);
  let streak = 0;
  while (set.has(start)) { streak++; start = shift(start, -7); }
  const sorted = [...set].sort();
  let best = 0, run = 0, prev = null;
  for (const w of sorted) { run = prev && shift(prev, 7) === w ? run + 1 : 1; best = Math.max(best, run); prev = w; }
  return { streak, best: Math.max(best, streak), playedNow, atRisk: !playedNow && streak > 0 };
}

/** Resumo da semana passada (para o cartão de segunda-feira). `lastRow` = missões guardadas da semana passada. */
export function lastWeekSummary({ prog, attempts, week, lastRow }) {
  const ws = weekStart() - WEEK;
  const we = ws + WEEK;
  const inWeek = (t) => t >= ws && t < we;
  const plays = prog.plays.filter((p) => inWeek(p.at));
  const firstClears = attempts.filter((x) => x.firstClear && inWeek(x.firstClear))
    .sort((a, b) => (b.chart.level - a.chart.level) || (a.chart.mode === 'D' ? -1 : 1));
  const improved = new Set();
  const best = new Map();
  for (const h of [...prog.history].sort((a, b) => a.at - b.at)) {
    const prev = best.get(h.chart.id);
    if (!h.broken && inWeek(h.at) && prev != null && h.score > prev) improved.add(h.chart.id);
    if (!h.broken) best.set(h.chart.id, Math.max(prev || 0, h.score));
  }
  const pbStart = week?.pb?.start != null ? Number(week.pb.start) : null;
  const pbEnd = week?.pb?.end != null ? Number(week.pb.end) : null;
  const r = week?.rival;
  return {
    ws, plays: plays.length, days: new Set(plays.map((p) => dayKey(p.at))).size,
    clears: firstClears.length, topClears: firstClears.slice(0, 3).map((x) => x.chart),
    improved: improved.size, missions: lastRow && lastRow.total ? { done: lastRow.done, total: lastRow.total } : null,
    pb: pbStart != null && pbEnd != null ? { start: pbStart, end: pbEnd, delta: Math.round((pbEnd - pbStart) * 100) / 100 } : null,
    rival: r ? {
      id: r.id, nickname: r.nickname, avatar: r.avatar, plays: r.plays || 0,
      delta: r.start != null && r.end != null ? Math.round((Number(r.end) - Number(r.start)) * 100) / 100 : null,
    } : null,
    empty: !plays.length && !firstClears.length && !improved.size,
  };
}

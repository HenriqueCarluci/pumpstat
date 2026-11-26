// Regras do jogo: grades, plates, PUMBILITY e tiers de dificuldade.
import { locale } from './i18n.js';

export const VERSIONS = {
  phoenix2: { id: 'phoenix2', name: 'Phoenix 2', short: 'P2', site: 'https://piugame.com' },
  phoenix: { id: 'phoenix', name: 'Phoenix', short: 'P1', site: 'https://phoenix.piugame.com' },
};

/** Recorde legado da Phoenix num chart da Phoenix 2 que ainda não tem recorde na P2 (ou null). */
export function legacyOf(c, version, show) {
  if (!show || version !== 'phoenix2' || c.score != null || c.otherScore == null) return null;
  return { score: c.otherScore, grade: c.otherGrade, plate: c.otherPlate };
}

export const GRADE_ORDER = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA+', 'AAA', 'AA+', 'AA', 'A+', 'A', 'B', 'C', 'D', 'F'];
export const gradeRank = (g) => (g ? GRADE_ORDER.indexOf(g) : 99);

export const PLATES = {
  PG: 'Perfect Game', UG: 'Ultimate Game', EG: 'Extreme Game', SG: 'Superb Game',
  MG: 'Marvelous Game', TG: 'Talented Game', FG: 'Fair Game', RG: 'Rough Game',
};
export const PLATE_ORDER = ['PG', 'UG', 'EG', 'SG', 'MG', 'TG', 'FG', 'RG'];

// Cortes de grade (score mínimo). Phoenix 2 subiu os cortes abaixo de AAA.
const CUTS_COMMON = [['SSS+', 995000], ['SSS', 990000], ['SS+', 985000], ['SS', 980000], ['S+', 975000], ['S', 970000], ['AAA+', 960000], ['AAA', 950000]];
export const GRADE_CUTS = {
  phoenix: [...CUTS_COMMON, ['AA+', 925000], ['AA', 900000], ['A+', 825000], ['A', 750000], ['B', 650000], ['C', 550000], ['D', 450000], ['F', 0]],
  phoenix2: [...CUTS_COMMON, ['AA+', 940000], ['AA', 920000], ['A+', 900000], ['A', 800000], ['B', 700000], ['C', 600000], ['D', 500000], ['F', 0]],
};
export function gradeFor(version, score) {
  if (score == null) return null;
  return GRADE_CUTS[version].find(([, min]) => score >= min)[0];
}
export function nextGrade(version, score) {
  const cuts = GRADE_CUTS[version];
  const i = cuts.findIndex(([, min]) => score >= min);
  return i > 0 ? { grade: cuts[i - 1][0], min: cuts[i - 1][1], need: cuts[i - 1][1] - score } : null;
}

export function gradeTier(g) {
  if (!g) return 'none';
  if (g.startsWith('SSS')) return 'sss';
  if (g.startsWith('SS')) return 'ss';
  if (g.startsWith('S')) return 's';
  if (g.startsWith('AAA')) return 'aaa';
  if (g.startsWith('AA')) return 'aa';
  if (g.startsWith('A')) return 'a';
  return 'low';
}

// ---------- PUMBILITY ----------
const P1_MULT = { 'SSS+': 1.5, SSS: 1.44, 'SS+': 1.38, SS: 1.32, 'S+': 1.26, S: 1.2, 'AAA+': 1.15, AAA: 1.1, 'AA+': 1.05, AA: 1.0, 'A+': 0.9, A: 0.8, B: 0.7, C: 0.6, D: 0.5, F: 0.4 };
// [double, single]
const P2_MULT = { 'SSS+': [1.5, 1.5], SSS: [1.49, 1.49], 'SS+': [1.48, 1.48], SS: [1.47, 1.47], 'S+': [1.46, 1.46], S: [1.45, 1.45], 'AAA+': [1.43, 1.43], AAA: [1.41, 1.41], 'AA+': [1.39, 1.39], AA: [1.37, 1.36], 'A+': [1.35, 1.33], A: [1.3, 1.28], B: [1.25, 1.2], C: [1.2, 1.1], D: [1.1, 1.0], F: [1.0, 0.9] };
const P2_PLATE = { PG: [0.02, 0.02], UG: [0.016, 0.017], EG: [0.012, 0.014], SG: [0.008, 0.008], MG: [0.006, 0.006], TG: [0.004, 0.004], FG: [0.002, 0.002], RG: [0, 0] };

/** Valor estimado de um chart para o PUMBILITY (0 quando não conta). */
export function chartRating(version, mode, level, score, grade, plate, broken) {
  if (score == null || broken || (mode !== 'S' && mode !== 'D') || level < 10) return 0;
  const g = grade || gradeFor(version, score);
  if (version === 'phoenix') {
    return round2((100 + 5 * (level - 10) * (level - 9)) * (P1_MULT[g] ?? 0));
  }
  let lv = level, i = 0;
  if (mode === 'S') { lv = level + 1; i = 1; }
  const base = 130 + 5 * lv + 5 * Math.max(0, lv - 24);
  return round2(base * ((P2_MULT[g]?.[i] ?? 0) + (P2_PLATE[plate]?.[i] ?? 0)));
}
const round2 = (v) => Math.round(v * 100) / 100;

export function pumbility(version, charts) {
  const rated = charts
    .filter((c) => c.score != null)
    .map((c) => ({ chart: c, value: chartRating(version, c.mode, c.level, c.score, c.grade, c.plate, c.broken) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const top = rated.slice(0, 50);
  return { total: round2(top.reduce((s, r) => s + r.value, 0)), top, floor: top.length === 50 ? top[49].value : 0 };
}

// ---------- tiers de dificuldade (dados do PIU Scores) ----------
export const TIERS = [
  { id: 'top', label: 'Topo do nível', short: '+++' },
  { id: 'high', label: 'Difícil', short: '++' },
  { id: 'mid', label: 'Médio', short: '=' },
  { id: 'low', label: 'Fácil', short: '−' },
  { id: 'bottom', label: 'Muito fácil', short: '−−' },
  { id: 'unknown', label: 'Sem dados', short: '?' },
];
const LABEL_TIER = { VeryHard: 'top', Hard: 'high', Underrated: 'high', Medium: 'mid', Easy: 'low', Overrated: 'low', VeryEasy: 'bottom' };

const TIER_NUM = { top: 2, high: 1, mid: 0, low: -1, bottom: -2 };
/** Tier do chart: dados do PIU Scores misturados com os votos da comunidade do StepClub
 *  (o PIU Scores pesa como 3 votos; sem dados dele, vale só a comunidade). */
export function chartTier(c) {
  const base = baseTier(c);
  const cm = c.community;
  // tier do clube (definido pelo admin) vale acima de tudo
  if (cm?.club != null) return ['bottom', 'low', 'mid', 'high', 'top'][cm.club + 2];
  if (!cm || !cm.votes || cm.avg == null) return base;
  const v = base in TIER_NUM ? (TIER_NUM[base] * 3 + cm.avg * cm.votes) / (3 + cm.votes) : cm.avg;
  return v >= 1.5 ? 'top' : v >= 0.5 ? 'high' : v > -0.5 ? 'mid' : v > -1.5 ? 'low' : 'bottom';
}
export const TIER_VOTES = [[2, 'Topo do nível'], [1, 'Difícil'], [0, 'Médio'], [-1, 'Fácil'], [-2, 'Muito fácil']];

function baseTier(c) {
  if (c.scoringLevel != null && c.mode !== 'C') {
    const d = c.scoringLevel - c.level;
    if (Math.abs(d) <= 1.5) {
      if (d >= 0.6) return 'top';
      if (d >= 0.2) return 'high';
      if (d > -0.2) return 'mid';
      if (d > -0.6) return 'low';
      return 'bottom';
    }
  }
  return LABEL_TIER[c.scoreDifficulty] || LABEL_TIER[c.passDifficulty] || 'unknown';
}

export const DIFF_PT = {
  VeryHard: 'Muito difícil', Hard: 'Difícil', Medium: 'Médio', Easy: 'Fácil', VeryEasy: 'Muito fácil',
  Underrated: 'Subestimado', Overrated: 'Superestimado', Unrecorded: 'Sem dados',
};

export const fmtScore = (n) => (n == null ? '—' : n.toLocaleString(locale()));
export const chartLabel = (c) => (c.mode === 'C' ? `CO-OP x${c.level}` : `${c.mode}${c.level}`);

// ---------- faixas de PUMBILITY da Phoenix 2 ----------
// Corte de cada faixa; cada uma tem 5 LVs (500 pts em BRONZE/SILVER, 200 pts nas demais).
export const PB_TIERS = [
  { name: 'BRONZE', min: 10000, step: 500 },
  { name: 'SILVER', min: 12500, step: 500 },
  { name: 'GOLD', min: 15000, step: 200 },
  { name: 'PLATINUM', min: 16000, step: 200 },
  { name: 'DIAMOND', min: 17000, step: 200 },
  { name: 'RED BERYL', min: 18000, step: 200 },
  { name: 'ALEXANDRITE', min: 19000, step: 200 },
  { name: 'ABYSS ABSOLUTE', min: 20000, step: 200 },
];

/** Faixa atual, LV, ícone oficial e quanto falta para o próximo LV e a próxima faixa. */
export function pbTier(points) {
  const p = Number(points) || 0;
  let i = -1;
  PB_TIERS.forEach((t, k) => { if (p >= t.min) i = k; });
  if (i < 0) {
    return { name: 'SEM FAIXA', lv: 0, icon: null, nextLabel: 'BRONZE LV.1', nextLvAt: 10000, toNextLv: 10000 - p, nextTier: PB_TIERS[0], toNextTier: 10000 - p, progress: p / 10000 };
  }
  const t = PB_TIERS[i];
  const lv = Math.min(5, Math.floor((p - t.min) / t.step) + 1);
  const isLast = i === PB_TIERS.length - 1 && lv === 5;
  const nextLvAt = lv < 5 ? t.min + lv * t.step : (PB_TIERS[i + 1]?.min ?? null);
  const lvStart = t.min + (lv - 1) * t.step;
  const nextTier = PB_TIERS[i + 1] || null;
  return {
    name: t.name, lv,
    icon: `https://piugame.com/l_img/pumbility/pumbility_${i * 5 + lv}.png`,
    nextLabel: isLast ? null : lv < 5 ? `${t.name} LV.${lv + 1}` : `${nextTier.name} LV.1`,
    nextLvAt, toNextLv: nextLvAt != null ? Math.max(0, nextLvAt - p) : 0,
    nextTier, toNextTier: nextTier ? Math.max(0, nextTier.min - p) : 0,
    progress: nextLvAt != null ? (p - lvStart) / (nextLvAt - lvStart) : 1,
  };
}

/** Melhores jeitos de subir o PUMBILITY: subir grade em charts jogados ou entrar com charts novos. */
export function pumbilitySuggestions(version, charts, limit = 6) {
  const pb = pumbility(version, charts);
  const inTop = new Set(pb.top.map((r) => r.chart.id));
  const floor = pb.top.length >= 50 ? pb.floor : 0;
  const ideas = [];
  for (const c of charts) {
    if ((c.mode !== 'S' && c.mode !== 'D') || c.level < 10) continue;
    const cur = c.score != null && !c.broken ? chartRating(version, c.mode, c.level, c.score, c.grade, c.plate, false) : 0;
    const base = inTop.has(c.id) ? cur : floor;
    if (c.score != null && !c.broken) {
      const nxt = nextGrade(version, c.score);
      if (!nxt) continue;
      const val = chartRating(version, c.mode, c.level, nxt.min, nxt.grade, c.plate, false);
      const gain = val - base;
      if (gain > 0.5) ideas.push({ chart: c, kind: 'grade', grade: nxt.grade, need: nxt.need, gain });
    }
  }
  // charts novos: o nível típico do top 50 com grade S
  const lvls = pb.top.map((r) => r.chart.mode === 'S' ? r.chart.level + 1 : r.chart.level).sort((a, b) => a - b);
  const typical = lvls.length ? lvls[Math.floor(lvls.length / 2)] : 15;
  for (const [mode, lv] of [['D', typical], ['D', typical + 1], ['S', typical - 1], ['S', typical]]) {
    const val = chartRating(version, mode, lv, 970000, 'S', null, false);
    const gain = val - floor;
    if (gain > 0.5) ideas.push({ kind: 'new', mode, level: lv, grade: 'S', gain });
  }
  return ideas.sort((a, b) => b.gain - a.gain).slice(0, limit);
}

export const TITLE_COLORS = [
  'linear-gradient(0deg,#fff,#cfd3da)', 'linear-gradient(0deg,#d79867,#63452e)', 'linear-gradient(0deg,#e4f5f8,#727878)',
  'linear-gradient(0deg,#fbf52d,#c28f26)', 'linear-gradient(0deg,#d7ffff,#6da3ef)', 'linear-gradient(0deg,#00a2ff,#004372)',
  'linear-gradient(0deg,#ff0000,#690000)', 'linear-gradient(0deg,#ca39ff,#591872)', 'linear-gradient(0deg,#5a5a5a,#2a2c2c)',
];

// Regras do jogo: grades, plates, PUMBILITY e tiers de dificuldade.

export const VERSIONS = {
  phoenix2: { id: 'phoenix2', name: 'Phoenix 2', short: 'P2', site: 'https://piugame.com' },
  phoenix: { id: 'phoenix', name: 'Phoenix', short: 'P1', site: 'https://phoenix.piugame.com' },
};

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

export function chartTier(c) {
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

export const fmtScore = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'));
export const chartLabel = (c) => (c.mode === 'C' ? `CO-OP x${c.level}` : `${c.mode}${c.level}`);

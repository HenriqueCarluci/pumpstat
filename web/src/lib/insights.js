// Progresso do jogador a partir do histórico de passes e quebras:
// evolução, taxa de pass por nível, pontos fracos por padrão, dicas e plano de treino semanal.
//
// De onde vem cada tentativa:
// - user_plays: cada jogada registrada (o piugame mostra só as 50 últimas, então quanto mais sincroniza, mais histórico).
// - user_scores/user_score_history: o recorde de cada chart. Recorde com stage break = nunca passou;
//   recorde que mudou de quebrado para passou = houve ao menos uma quebra antes.
import { hasGimmick } from './special.js';
import { chartTier, pumbility, TIER_NUM } from './piu.js';

export const PATTERNS = ['twist', 'drill', 'run', 'bracket', 'jump', 'jack', 'doublestep', 'footswitch'];
// pseudo-padrões: velocidade (notas/s alta para o nível) e resistência (charts longos e constantes)
export const DIMENSIONS = [...PATTERNS, 'speed', 'stamina', 'gimmick'];

const DAY = 86400000;

export function parseProgress(raw, data) {
  const byId = data.byId;
  const styles = new Map();
  for (const r of raw.styles || []) {
    const pct = {};
    PATTERNS.forEach((p, i) => { pct[p] = Number(r[i + 1]) || 0; });
    styles.set(r[0], { pct, nps: r[9] == null ? null : Number(r[9]), sustained: !!r[10] });
  }
  const plays = (raw.plays || []).map((p) => ({
    chart: byId.get(p[0]), at: p[1] * 1000, score: p[2], grade: p[3], broken: !!p[4],
    perfect: p[5], great: p[6], good: p[7], bad: p[8], miss: p[9],
  })).filter((p) => p.chart);
  const history = (raw.history || []).map((h) => ({ chart: byId.get(h[0]), at: h[1] * 1000, score: h[2], grade: h[3], plate: h[4], broken: !!h[5] }))
    .filter((h) => h.chart);
  const firsts = new Map((raw.firsts || []).map((f) => [f[0], { firstSeen: f[1] ? f[1] * 1000 : null, achieved: f[2] ? f[2] * 1000 : null }]));

  // "velocidade": nps acima do percentil 75 dos charts do mesmo modo e nível
  const npsByKey = new Map();
  for (const [id, st] of styles) {
    const c = byId.get(id);
    if (!c || st.nps == null) continue;
    const k = `${c.mode}${c.level}`;
    if (!npsByKey.has(k)) npsByKey.set(k, []);
    npsByKey.get(k).push(st.nps);
  }
  const p75 = new Map();
  for (const [k, arr] of npsByKey) { arr.sort((a, b) => a - b); p75.set(k, arr[Math.floor(arr.length * 0.75)]); }
  for (const [id, st] of styles) {
    const c = byId.get(id);
    const lim = c && p75.get(`${c.mode}${c.level}`);
    st.pct.speed = lim != null && st.nps != null && st.nps >= lim ? 60 : 0;
    st.pct.stamina = st.sustained ? 60 : 0;
  }
  return { styles, plays, history, firsts };
}

/** Tentativas por chart: passes, quebras e se já passou. */
export function chartAttempts(data, prog) {
  const map = new Map();
  const get = (c) => {
    if (!map.has(c.id)) map.set(c.id, { chart: c, attempts: 0, fails: 0, passes: 0, cleared: false, firstClear: null, lastAt: 0 });
    return map.get(c.id);
  };
  for (const p of prog.plays) {
    if (p.chart.mode !== 'S' && p.chart.mode !== 'D') continue;
    const r = get(p.chart);
    r.attempts++;
    if (p.broken) r.fails++; else { r.passes++; r.firstClear = Math.min(r.firstClear ?? Infinity, p.at); }
    r.lastAt = Math.max(r.lastAt, p.at);
  }
  const hadBrokenBest = new Set(prog.history.filter((h) => h.broken).map((h) => h.chart.id));
  for (const h of prog.history) {
    if (!h.broken) { const r = get(h.chart); r.firstClear = Math.min(r.firstClear ?? Infinity, h.at); }
  }
  for (const c of data.charts) {
    if (c.score == null || (c.mode !== 'S' && c.mode !== 'D')) continue;
    const r = get(c);
    r.cleared = !c.broken;
    const f = prog.firsts.get(c.id);
    if (r.cleared) {
      // passou em algum momento: se nenhuma jogada registrada passou, conta essa tentativa
      if (r.passes === 0) { r.passes = 1; r.attempts++; }
      const when = Math.min(r.firstClear ?? Infinity, f?.achieved ?? Infinity, f?.firstSeen ?? Infinity, c.achievedAt ? Date.parse(c.achievedAt) : Infinity);
      r.firstClear = Number.isFinite(when) ? when : null;
      // recorde já esteve quebrado antes de passar: houve ao menos uma quebra
      if (r.fails === 0 && hadBrokenBest.has(c.id)) { r.fails = 1; r.attempts++; }
    } else {
      r.firstClear = null;
      if (r.fails === 0) { r.fails = 1; r.attempts++; }
    }
    r.lastAt = Math.max(r.lastAt, f?.achieved ?? 0, c.achievedAt ? Date.parse(c.achievedAt) : 0);
  }
  return [...map.values()];
}

/** Estatística por nível: charts tentados, passados, tentativas e quebras. */
export function levelStats(attempts, mode) {
  const lv = new Map();
  for (const r of attempts) {
    if (r.chart.mode !== mode) continue;
    const L = r.chart.level;
    if (!lv.has(L)) lv.set(L, { level: L, charts: 0, cleared: 0, attempts: 0, fails: 0 });
    const s = lv.get(L);
    s.charts++; if (r.cleared) s.cleared++;
    s.attempts += r.attempts; s.fails += r.fails;
  }
  return [...lv.values()].sort((a, b) => a.level - b.level);
}

/** Nível do jogador num modo: teto (maior passado), conforto (passa a maioria) e alvo da semana. */
export function playerLevel(stats) {
  const cleared = stats.filter((s) => s.cleared > 0);
  if (!cleared.length) return null;
  const ceiling = Math.max(...cleared.map((s) => s.level));
  let comfort = null;
  for (const s of stats) if (s.charts >= 2 && s.cleared / s.charts >= 0.7) comfort = s.level;
  if (comfort == null || comfort > ceiling) comfort = Math.max(1, ceiling - 1);
  const target = comfort >= ceiling ? ceiling + 1 : comfort + 1;
  return { ceiling, comfort, target };
}

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sig = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));

/** Dificuldade efetiva do chart: o nível mais a faixa do tier (Topo ≈ +0,5 nível, Fundo ≈ -0,5). */
export function effLevel(c) {
  const n = TIER_NUM[chartTier(c)];
  return c.level + (n == null ? 0 : n / 6);
}

// Corte de "carregado no padrão": o quartil de cima do catálogo inteiro (piucenter, % das notas), por modo e faixa de nível.
// É fixo pelo catálogo, não pelos charts que a pessoa jogou: quem foge de corrida quase não tem charts acima do corte,
// e aí corrida fica sem dado em vez de virar o padrão "de sempre".
//            twist drill  run  bracket jump jack  dstep fswitch
const CUT = {
  S: [[18.0, 7.8, 65.3, 3, 18.9, 8.4, 3, 3], [19.4, 11.6, 68.1, 7.4, 17.3, 6.8, 3.9, 3], [16.4, 13.8, 65.4, 18.5, 20.6, 5.7, 4.4, 3]],
  D: [[26.6, 4.2, 65.9, 3, 20.2, 8.7, 3, 3], [26.7, 8.4, 71.1, 5.2, 18.0, 6.4, 3.3, 3], [23.6, 11.0, 68.1, 20.7, 20.1, 5.3, 4.8, 3]],
};
export function isHeavy(st, c, p) {
  const v = st.pct[p] || 0;
  if (st.derived || !PATTERNS.includes(p)) return v >= 50; // padrões do PIU Scores/comunidade e velocidade/resistência/gimmick
  const row = (CUT[c.mode] || CUT.S)[c.level <= 17 ? 0 : c.level <= 21 ? 1 : 2];
  return v >= row[PATTERNS.indexOf(p)];
}

/**
 * Modelo do jogador na zona: chance de quebrar e nota esperada em função da dificuldade efetiva (nível + tier).
 * Regressão logística com 2 parâmetros (com um empurrão leve para valores razoáveis) e reta para a nota.
 */
function fitPlayer(zone, ceiling) {
  const pts = zone.map((r) => ({ x: effLevel(r.chart) - ceiling, w: Math.min(r.attempts, 4), y: r.attempts ? r.fails / r.attempts : 0 }))
    .filter((p) => p.w > 0);
  const W = pts.reduce((a, p) => a + p.w, 0) || 1;
  const base = Math.min(0.95, Math.max(0.05, pts.reduce((a, p) => a + p.w * p.y, 0) / W));
  let A = logit(base), B = 1.2;
  for (let it = 0; it < 25; it++) {
    // Newton com prior: A ~ N(logit(base), 2²), B ~ N(1.2, 0.8²)
    let gA = -(A - logit(base)) / 4, gB = -(B - 1.2) / 0.64, hAA = -1 / 4, hBB = -1 / 0.64, hAB = 0;
    for (const p of pts) {
      const q = sig(A + B * p.x), d = p.w * (p.y - q), v = p.w * q * (1 - q);
      gA += d; gB += d * p.x; hAA -= v; hBB -= v * p.x * p.x; hAB -= v * p.x;
    }
    const det = hAA * hBB - hAB * hAB;
    if (!det) break;
    const dA = (hBB * gA - hAB * gB) / det, dB = (hAA * gB - hAB * gA) / det;
    A -= dA; B -= dB;
    if (Math.abs(dA) + Math.abs(dB) < 1e-6) break;
  }
  B = Math.max(0, B);
  const sc = zone.filter((r) => r.cleared && r.chart.score != null).map((r) => ({ x: effLevel(r.chart) - ceiling, y: r.chart.score }));
  let c0 = median(sc.map((p) => p.y)), c1 = -25000;
  if (sc.length >= 5) {
    const mx = sc.reduce((a, p) => a + p.x, 0) / sc.length, my = sc.reduce((a, p) => a + p.y, 0) / sc.length;
    const sxx = sc.reduce((a, p) => a + (p.x - mx) ** 2, 0), sxy = sc.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
    c1 = sxx > 0.5 ? Math.min(0, sxy / sxx) : -25000;
    c0 = my - c1 * mx;
  }
  return { fail: (c) => sig(A + B * (effLevel(c) - ceiling)), score: (c) => c0 + c1 * (effLevel(c) - ceiling), hasScore: sc.length >= 5 };
}

/**
 * Somas para pontos fracos e fortes por padrão numa versão.
 * Cada chart é comparado com o que o modelo do próprio jogador espera para a dificuldade dele (nível + tier do ArcadeStat),
 * então um padrão só aparece como fraco se você quebra mais (ou tira menos nota) do que nos outros charts igualmente difíceis.
 * Cada chart pesa no máximo 4 tentativas, para uma música repetida muitas vezes não dominar o resultado.
 */
export function weaknessSums(attempts, prog, mode, lvl) {
  const sums = new Map();
  if (!lvl) return sums;
  const lo = lvl.ceiling - 4, hi = lvl.ceiling + 1;
  const zone = attempts.filter((r) => r.chart.mode === mode && r.chart.level >= lo && r.chart.level <= hi && styleOf(prog, r.chart));
  if (zone.length < 6) return sums;
  const model = fitPlayer(zone, lvl.ceiling);
  for (const p of DIMENSIONS) {
    const t = { W: 0, O: 0, E: 0, N: 0, S: 0, SN: 0 };
    for (const r of zone) {
      if (!r.attempts || !isHeavy(styleOf(prog, r.chart), r.chart, p)) continue;
      const w = Math.min(r.attempts, 4);
      t.W += w; t.O += w * (r.fails / r.attempts); t.E += w * model.fail(r.chart); t.N++;
      if (model.hasScore && r.cleared && r.chart.score != null) { t.S += r.chart.score - model.score(r.chart); t.SN++; }
    }
    if (t.N > 0) sums.set(p, t);
  }
  return sums;
}

/** Junta as somas de uma ou mais versões e calcula o índice de cada padrão (maior = mais fraco; perto de 0 = dentro do esperado). */
export function weaknesses(...sumsList) {
  return DIMENSIONS.map((p) => {
    const t = { W: 0, O: 0, E: 0, N: 0, S: 0, SN: 0 };
    for (const sums of sumsList) { const x = sums.get(p); if (x) for (const k in t) t[k] += x[k]; }
    if (t.N < 3 || !t.W) return null;
    // quebras a mais (ou a menos) do que o esperado, com encolhimento para amostras pequenas (6 tentativas "neutras")
    const excess = (t.O - t.E) / (t.W + 6);
    // nota acima/abaixo do esperado para a dificuldade, também encolhida
    const scoreGap = t.SN >= 2 ? (t.S / t.SN) * (t.SN / (t.SN + 3)) : null;
    const index = excess * 100 + (scoreGap != null ? (-scoreGap / 1000) * 0.6 : 0);
    return {
      id: p, index, excess, scoreGap, evidence: t.N,
      failRate: t.O / t.W, expected: t.E / t.W,
      attempts: t.W, charts: t.N, confidence: t.N >= 10 ? 'high' : t.N >= 5 ? 'mid' : 'low',
      neutral: Math.abs(index) < 5,
    };
  }).filter(Boolean).sort((a, b) => b.index - a.index);
}

// Padrões do PIU Scores (c.skills) e tags da comunidade do PIU Stats: reserva para charts sem tags do ArcadeStat.
const TAG_TO_DIM = { twist: 'twist', drill: 'drill', run: 'run', bracket: 'bracket', jump: 'jump', jack: 'jack', doublestep: 'doublestep',
  footswitch: 'footswitch', stamina: 'stamina', speed: 'speed', gimmick: null };
const BADGE_RULES = [
  ['twist', (b) => /twist/.test(b) && !/without twist/.test(b)], ['drill', (b) => /drill/.test(b)], ['run', (b) => /^runs?$/.test(b.trim())],
  ['bracket', (b) => /bracket/.test(b)], ['jump', (b) => /jump/.test(b)], ['jack', (b) => /jack/.test(b)],
  ['doublestep', (b) => /double ?step/.test(b)], ['footswitch', (b) => /footswitch/.test(b)],
  ['stamina', (b) => /sustain|stamina/.test(b)], ['speed', (b) => /burst/.test(b)],
];
export function badgeStyle(c) {
  const pct = {};
  for (const raw of c.skills || []) {
    const b = String(raw).toLowerCase();
    for (const [dim, test] of BADGE_RULES) if (test(b)) pct[dim] = 50;
  }
  for (const tg of c.community?.tags || []) { const d = TAG_TO_DIM[Array.isArray(tg) ? tg[0] : tg]; if (d) pct[d] = Math.max(pct[d] || 0, 50); }
  if (hasGimmick(c)) pct.gimmick = 60;
  return Object.keys(pct).length ? pct : null;
}
// Tags do ArcadeStat (com peso 0–100, 100 = a mais votada do chart) → dimensões das métricas.
const ARC_TO_DIM = { twist: 'twist', high_twist: 'twist', horizontal_twist: 'twist', spin: 'twist', crossover: 'twist',
  drill: 'drill', run: 'run', bracket: 'bracket', jump: 'jump', jack: 'jack', switch: 'footswitch',
  stamina: 'stamina', fast: 'speed', gimmick: 'gimmick' };
export function arcStyle(c) {
  if (!c.tagBars) return null;
  const pct = {};
  for (const [tag, v] of c.tagBars) { const d = ARC_TO_DIM[tag]; if (d) pct[d] = Math.max(pct[d] || 0, v); }
  return Object.keys(pct).length ? pct : null;
}
// O piucenter não entra mais (dados ruins). O estilo vem das tags votadas no ArcadeStat; só quando o chart
// não tem nenhuma, cai para os padrões do PIU Scores. Tags da comunidade do PIU Stats e gimmick marcado somam.
export function styleOf(prog, c) {
  const arc = arcStyle(c);
  const pct = arc ? { ...arc } : { ...(badgeStyle(c) || {}) };
  for (const tg of c.community?.tags || []) { const d = TAG_TO_DIM[Array.isArray(tg) ? tg[0] : tg]; if (d) pct[d] = Math.max(pct[d] || 0, 50); }
  if (hasGimmick(c)) pct.gimmick = Math.max(pct.gimmick || 0, 60);
  return Object.keys(pct).length ? { pct, nps: null, sustained: false, derived: true } : null;
}

/** Precisão nas jogadas passadas perto do nível do jogador (julgamentos). */
function accuracy(prog, mode, lvl) {
  const ps = prog.plays.filter((p) => !p.broken && p.chart.mode === mode && p.chart.level >= lvl.ceiling - 3 && p.perfect != null);
  if (ps.length < 3) return null;
  let notes = 0, miss = 0, weak = 0;
  for (const p of ps) {
    const n = (p.perfect || 0) + (p.great || 0) + (p.good || 0) + (p.bad || 0) + (p.miss || 0);
    if (!n) continue;
    notes += n; miss += (p.miss || 0); weak += (p.great || 0) + (p.good || 0) + (p.bad || 0);
  }
  if (!notes) return null;
  return { plays: ps.length, missRate: miss / notes, offRate: weak / notes, missPerPlay: miss / ps.length };
}

/**
 * Dicas baseadas no histórico. Cada dica: { id, kind ('wall'|'stuck'|'pattern'|'accuracy'|'trend'|'data'|'strength'), vars, charts }.
 * O texto é montado na tela (traduzido).
 */
export function tips(data, prog, attempts, mode, lvl, weak) {
  const out = [];
  if (!lvl) return out;
  const stats = levelStats(attempts, mode);
  const at = (L) => stats.find((s) => s.level === L);
  const m = mode;

  // 1. muro de nível: passa pouco no nível alvo comparado ao anterior
  const tgt = at(lvl.target), prev = at(lvl.target - 1);
  if (tgt && tgt.charts >= 2 && prev && prev.charts >= 2 && tgt.cleared / tgt.charts < 0.5) {
    out.push({ id: 'wall', kind: 'wall', vars: { m, L: lvl.target, p: tgt.cleared, a: tgt.charts, r: Math.round((prev.cleared / prev.charts) * 100), L0: lvl.target - 1 },
      charts: easiest(data, attempts, m, lvl.target, 3) });
  }

  // 2. charts travados: quebrou 2+ vezes e nunca passou
  const stuck = attempts.filter((r) => r.chart.mode === m && !r.cleared && r.fails >= 2).sort((a, b) => b.fails - a.fails).slice(0, 3);
  for (const r of stuck) {
    const st = styleOf(prog, r.chart);
    const top = st ? DIMENSIONS.map((p) => [p, st.pct[p] || 0]).filter(([, v]) => v >= 15).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p) : [];
    out.push({ id: `stuck-${r.chart.id}`, kind: 'stuck', vars: { n: r.fails, patterns: top }, chart: r.chart,
      charts: top[0] ? byPattern(data, attempts, prog, m, [r.chart.level - 2, r.chart.level - 1], top[0], 3) : [] });
  }

  // 3. ponto fraco principal e um ponto forte
  const w0 = weak.find((w) => w.index >= 6 && w.confidence !== 'low');
  if (w0) {
    out.push({ id: `pattern-${w0.id}`, kind: 'pattern', vars: { p: w0.id, f: Math.round(w0.failRate * 100), e: Math.round(w0.expected * 100), gap: w0.scoreGap },
      charts: byPattern(data, attempts, prog, m, [lvl.comfort - 1, lvl.comfort], w0.id, 3) });
  }
  const s0 = [...weak].reverse().find((w) => w.index <= -6 && w.confidence !== 'low');
  if (s0) out.push({ id: `strength-${s0.id}`, kind: 'strength', vars: { p: s0.id, f: Math.round(s0.failRate * 100), e: Math.round(s0.expected * 100) },
    charts: byPattern(data, attempts, prog, m, [lvl.target, lvl.target], s0.id, 2, true) });

  // 4. precisão: passa, mas com muitos misses ou muitos greats/goods
  const acc = accuracy(prog, m, lvl);
  if (acc && acc.missRate >= 0.025) out.push({ id: 'miss', kind: 'accuracy', sub: 'miss', vars: { n: Math.round(acc.missPerPlay), k: acc.plays } });
  else if (acc && acc.offRate >= 0.12) out.push({ id: 'timing', kind: 'accuracy', sub: 'timing', vars: { r: Math.round(acc.offRate * 100), k: acc.plays } });

  // 5. tendência: últimas 2 semanas x antes
  const now = Date.now();
  const recent = prog.plays.filter((p) => p.chart.mode === m && now - p.at <= 14 * DAY);
  const before = prog.plays.filter((p) => p.chart.mode === m && now - p.at > 14 * DAY);
  if (recent.length >= 5 && before.length >= 5) {
    const rr = recent.filter((p) => !p.broken).length / recent.length, rb = before.filter((p) => !p.broken).length / before.length;
    const lvR = median(recent.map((p) => p.chart.level)), lvB = median(before.map((p) => p.chart.level));
    if (Math.abs(rr - rb) >= 0.08) out.push({ id: 'trend', kind: 'trend', vars: { a: Math.round(rr * 100), b: Math.round(rb * 100), la: lvR, lb: lvB, up: rr > rb } });
  }

  // 6. pouco histórico de jogadas: o piugame só guarda as 50 últimas
  if (prog.plays.length < 30) out.push({ id: 'data', kind: 'data', vars: { n: prog.plays.length } });
  return out;
}

/** Charts mais fáceis (pelo tier) do nível que o jogador ainda não passou. */
function easiest(data, attempts, mode, level, n) {
  const done = new Set(attempts.filter((r) => r.cleared).map((r) => r.chart.id));
  const order = { fundo: 0, baixo: 1, medio_baixo: 2, medio: 3, unknown: 3.5, medio_alto: 4, alto: 5, topo: 6 };
  return data.charts.filter((c) => c.mode === mode && c.level === level && !done.has(c.id))
    .sort((a, b) => order[chartTier(a)] - order[chartTier(b)] || (a.scoringLevel ?? 99) - (b.scoringLevel ?? 99)).slice(0, n);
}

/** Charts com muito de um padrão numa faixa de níveis (para treinar o ponto fraco). */
export function byPattern(data, attempts, prog, mode, [lo, hi], p, n, unplayedOnly = false) {
  const done = new Set(attempts.filter((r) => r.cleared).map((r) => r.chart.id));
  return data.charts.filter((c) => c.mode === mode && c.level >= lo && c.level <= hi
      && (styleOf(prog, c)?.pct[p] || 0) >= 20 && (!unplayedOnly || !done.has(c.id)))
    .sort((a, b) => (styleOf(prog, b).pct[p] - styleOf(prog, a).pct[p]) || (a.level - b.level)).slice(0, n);
}

// ---------- plano de treino semanal ----------
export function weekStart(ts = Date.now()) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda-feira
  return d.getTime();
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
const pick = (arr, r, used) => { const pool = arr.filter((c) => !used.has(c.id)); if (!pool.length) return null; const c = pool[Math.floor(r() * pool.length)]; used.add(c.id); return c; };

/**
 * Plano da semana: 3 sessões com aquecimento, ponto fraco, consolidação do nível, desafio e nota.
 * Determinístico por semana (o mesmo plano a semana toda) e com o progresso das jogadas desde segunda.
 */
export function trainingPlan(version, data, prog, attempts, mode, lvl, weak, recs) {
  if (!lvl) return null;
  const ws = weekStart();
  const r = rng(Math.floor(ws / DAY) * 31 + (mode === 'D' ? 7 : 3) + lvl.target);
  const used = new Set();
  const cleared = new Set(attempts.filter((x) => x.cleared).map((x) => x.chart.id));
  const of = (lo, hi) => data.charts.filter((c) => c.mode === mode && c.level >= lo && c.level <= hi);
  const order = { fundo: 0, baixo: 1, medio_baixo: 2, medio: 3, unknown: 3.5, medio_alto: 4, alto: 5, topo: 6 };
  const weakP = (weak.find((w) => w.index >= 6 && w.confidence !== 'low') || weak.find((w) => !w.neutral && w.index > 0))?.id || null;

  const warm = of(lvl.comfort - 3, lvl.comfort - 2).filter((c) => cleared.has(c.id));
  const focus = weakP ? of(lvl.comfort - 2, lvl.comfort).filter((c) => (styleOf(prog, c)?.pct[weakP] || 0) >= 20)
    .sort((a, b) => styleOf(prog, b).pct[weakP] - styleOf(prog, a).pct[weakP]).slice(0, 18) : [];
  const consolidate = of(lvl.target - 1, lvl.target - 1).filter((c) => !cleared.has(c.id))
    .sort((a, b) => order[chartTier(a)] - order[chartTier(b)]).slice(0, 12);
  const challenge = of(lvl.target, lvl.target).filter((c) => !cleared.has(c.id))
    .sort((a, b) => order[chartTier(a)] - order[chartTier(b)]).slice(0, 8);
  const score = (recs || []).map((x) => x.chart).filter((c) => c && c.mode === mode);

  const sessions = [0, 1, 2].map(() => {
    const items = [];
    const add = (kind, c) => { if (c) items.push({ kind, chart: c }); };
    add('warm', pick(warm, r, used)); add('warm', pick(warm, r, used));
    add('focus', pick(focus, r, used)); add('focus', pick(focus, r, used));
    add('consolidate', pick(consolidate.length ? consolidate : challenge, r, used));
    add('challenge', pick(challenge, r, used));
    add('score', pick(score.slice(0, 9), r, used));
    return items;
  });

  // progresso desde segunda
  const week = prog.plays.filter((p) => p.at >= ws && p.chart.mode === mode);
  const planned = new Set(sessions.flat().map((i) => i.chart.id));
  const playedIds = new Set(week.map((p) => p.chart.id));
  const newClearsTarget = attempts.filter((x) => x.chart.mode === mode && x.chart.level === lvl.target && x.firstClear && x.firstClear >= ws).length;
  const newClearsPrev = attempts.filter((x) => x.chart.mode === mode && x.chart.level === lvl.target - 1 && x.firstClear && x.firstClear >= ws).length;
  const weakPlays = weakP ? week.filter((p) => (styleOf(prog, p.chart)?.pct[weakP] || 0) >= 20).length : 0;
  const pbNow = pumbility(version, data.charts).total;
  const hist = (data.pumbilityHistory || []).filter(([at]) => Date.parse(at) < ws);
  const pbStart = hist.length ? Number(hist[hist.length - 1][1]) : null;

  const goals = [
    { id: 'clear_target', vars: { n: 2, m: mode, L: lvl.target }, cur: newClearsTarget, goal: 2 },
    { id: 'clear_prev', vars: { n: 3, m: mode, L: lvl.target - 1 }, cur: newClearsPrev, goal: 3 },
    weakP && { id: 'weak', vars: { n: 6, p: weakP }, cur: weakPlays, goal: 6 },
    { id: 'plan', vars: { n: planned.size }, cur: [...planned].filter((id) => playedIds.has(id)).length, goal: planned.size },
  ].filter(Boolean);
  return { weekStart: ws, mode, lvl, weakP, sessions, goals, played: playedIds, pb: { now: pbNow, start: pbStart } };
}

// ---------- evolução ----------
/** Clears acumulados e maior nível passado ao longo do tempo (por semana). */
export function clearTimeline(attempts, mode) {
  const firsts = attempts.filter((r) => r.chart.mode === mode && r.cleared && r.firstClear).map((r) => ({ at: r.firstClear, level: r.chart.level }))
    .sort((a, b) => a.at - b.at);
  if (!firsts.length) return [];
  const out = [];
  let total = 0, maxLv = 0, wk = weekStart(firsts[0].at), i = 0;
  const end = weekStart();
  while (wk <= end) {
    let added = 0;
    while (i < firsts.length && firsts[i].at < wk + 7 * DAY) { total++; added++; maxLv = Math.max(maxLv, firsts[i].level); i++; }
    out.push({ at: wk, total, added, maxLv });
    wk += 7 * DAY;
  }
  return out;
}

/** Jogadas por semana: passou x quebrou. */
export function playsPerWeek(prog, mode) {
  const map = new Map();
  for (const p of prog.plays) {
    if (mode && p.chart.mode !== mode) continue;
    const w = weekStart(p.at);
    const s = map.get(w) || { at: w, pass: 0, fail: 0 };
    if (p.broken) s.fail++; else s.pass++;
    map.set(w, s);
  }
  return [...map.values()].sort((a, b) => a.at - b.at);
}

// ---------- composição por padrão (gráficos de setor) ----------
/**
 * Padrão que mais se destaca no chart: o de maior % acima da média da zona (corrida aparece em quase todo chart,
 * então "maior %" daria corrida para quase tudo). Sem destaque claro, null.
 */
export function mainPattern(prog, c, mean) {
  const st = styleOf(prog, c);
  if (!st) return null;
  let best = null, v = 0;
  for (const p of DIMENSIONS) {
    const x = st.pct[p] || 0;
    const lift = mean ? x / Math.max(mean[p] || 0, 2) : x;
    if (x >= 5 && lift > v) { v = lift; best = p; }
  }
  return mean ? (v >= 1.3 ? best : null) : best;
}

/** Passes e quebras perto do nível do jogador, agrupados pelo padrão que mais se destaca em cada chart (cada chart pesa no máximo 4). */
export function patternShare(attempts, prog, mode, lvl) {
  const pass = {}, fail = {};
  if (!lvl) return { pass, fail };
  const zone = attempts.filter((r) => r.chart.mode === mode && r.chart.level >= lvl.ceiling - 4 && r.chart.level <= lvl.ceiling + 1 && styleOf(prog, r.chart));
  const mean = {};
  for (const p of DIMENSIONS) mean[p] = zone.reduce((a, r) => a + (styleOf(prog, r.chart).pct[p] || 0), 0) / (zone.length || 1);
  for (const r of zone) {
    const p = mainPattern(prog, r.chart, mean);
    if (!p || !r.attempts) continue;
    const k = Math.min(r.attempts, 4) / r.attempts;
    if (r.passes) pass[p] = (pass[p] || 0) + r.passes * k;
    if (r.fails) fail[p] = (fail[p] || 0) + r.fails * k;
  }
  for (const o of [pass, fail]) for (const p in o) o[p] = Math.round(o[p]);
  return { pass, fail };
}

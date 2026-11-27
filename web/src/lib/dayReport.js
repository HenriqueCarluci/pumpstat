// Relatório do dia de jogo: junta o que veio do banco (my_day_report) com os charts carregados no app.
import { rpc } from './api.js';
import { gradeRank, PLATE_ORDER } from './piu.js';

export const loadDayReport = (version, day) => rpc('my_day_report', { p_version: version, p_day: day || null });

const plateRank = (p) => (p ? PLATE_ORDER.indexOf(p) : 99);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Monta as listas e os totais do dia. `byId` = mapa de charts do app. */
export function buildDay(raw, byId) {
  if (!raw?.day) return null;
  // só dá para afirmar "primeiro passe" se já tínhamos a foto completa dos melhores scores antes do dia;
  // sem ela, um passe sem registro anterior pode ser primeiro passe ou upscore
  const known = raw.coverage != null && raw.start != null && raw.coverage <= raw.start;
  const rows = (raw.charts || []).map(([id, tries, passes, score, grade, plate, prevScore, prevGrade, prevPlate, triesBefore, bestFail]) => {
    const chart = byId.get(id);
    if (!chart) return null;
    // passe só com score: jogada sem score e sem marca de quebra não diz se passou
    const passed = passes > 0 && score != null;
    const hadPass = prevScore != null;
    const newClear = passed && !hadPass && known;
    const unknownPrev = passed && !hadPass && !known;
    const pb = passed && hadPass && score > prevScore;
    return {
      chart, tries, passes, score, grade, plate, prevScore, prevGrade, prevPlate, triesBefore, bestFail,
      passed, newClear, unknownPrev, pb, delta: pb ? score - prevScore : 0,
      gradeUp: pb && gradeRank(grade) < gradeRank(prevGrade),
      plateUp: passed && hadPass && plate && plateRank(plate) < plateRank(prevPlate),
      // ainda não passou nunca: o que treinar
      stuck: !passed && !hadPass,
    };
  }).filter(Boolean);

  const plays = (raw.plays || []).map(([id, at, score, grade, plate, broken, perfect, great, good, bad, miss]) => ({
    chart: byId.get(id), at, score, grade, plate, broken, perfect, great, good, bad, miss,
  })).filter((p) => p.chart);

  // sem score e sem marca de quebra o site da Pump não diz se passou: não conta como passe
  const passed = (p) => !p.broken && p.score != null;
  const passes = plays.filter(passed);
  const bestPlay = new Map();
  for (const p of plays) {
    const b = bestPlay.get(p.chart.id);
    if (!b || (passed(p) && (!passed(b) || p.score > b.score)) || (!passed(p) && !passed(b) && (p.score || 0) > (b.score || 0))) bestPlay.set(p.chart.id, p);
  }
  for (const r of rows) r.best = bestPlay.get(r.chart.id) || null;
  const sd = (p) => p.chart.mode === 'S' || p.chart.mode === 'D';
  const maxOf = (mode) => Math.max(0, ...passes.filter((p) => p.chart.mode === mode).map((p) => p.chart.level)) || null;
  const judged = plays.filter((p) => p.perfect != null);
  const notes = judged.reduce((a, p) => a + p.perfect + p.great + p.good + p.bad + p.miss, 0);
  const totals = {
    plays: plays.length,
    passes: passes.length,
    fails: plays.length - passes.length,
    rate: plays.length ? passes.length / plays.length : 0,
    charts: rows.length,
    newClears: rows.filter((r) => r.newClear).length,
    pbs: rows.filter((r) => r.pb).length,
    maxD: maxOf('D'),
    maxS: maxOf('S'),
    avgLevel: avg(passes.filter(sd).map((p) => p.chart.level)),
    first: plays[0]?.at || null,
    last: plays[plays.length - 1]?.at || null,
    // acerto: PERFECT + GREAT sobre todas as notas julgadas
    accuracy: notes ? judged.reduce((a, p) => a + p.perfect + p.great, 0) / notes : null,
    misses: judged.reduce((a, p) => a + p.miss, 0),
  };

  // por nível (S/D): tentativas e passes, para ver onde o dia rendeu
  const levels = new Map();
  for (const p of plays.filter(sd)) {
    const k = `${p.chart.mode}${p.chart.level}`;
    const v = levels.get(k) || { mode: p.chart.mode, level: p.chart.level, tries: 0, passes: 0 };
    v.tries += 1; if (passed(p)) v.passes += 1;
    levels.set(k, v);
  }

  const byLevel = (a, b) => b.chart.level - a.chart.level;
  return {
    day: raw.day,
    // passes em que não dá para saber se foram primeiro passe ou upscore, e desde quando temos o histórico completo
    unknownPrev: rows.filter((r) => r.unknownPrev).length,
    coverage: raw.coverage || null,
    days: raw.days || [],
    prev: raw.prev && raw.prev.day ? raw.prev : null,
    totals,
    plays,
    rows,
    newClears: rows.filter((r) => r.newClear).sort(byLevel),
    pbs: rows.filter((r) => r.pb).sort((a, b) => b.chart.level - a.chart.level || b.delta - a.delta),
    stuck: rows.filter((r) => r.stuck).sort(byLevel),
    levels: [...levels.values()].sort((a, b) => a.mode.localeCompare(b.mode) || b.level - a.level),
  };
}

/** Destaques do dia para a imagem: primeiros passes e recordes, do nível mais alto para o mais baixo. */
export function highlights(rep, max = 6) {
  const list = [
    ...rep.newClears.map((r) => ({ ...r, kind: 'clear' })),
    ...rep.pbs.map((r) => ({ ...r, kind: 'pb' })),
  ].sort((a, b) => b.chart.level - a.chart.level || (a.kind === 'clear' ? -1 : 1));
  if (list.length) return list.slice(0, max);
  // sem recorde: os melhores passes do dia
  return rep.rows.filter((r) => r.passed).sort((a, b) => b.chart.level - a.chart.level || b.score - a.score)
    .slice(0, max).map((r) => ({ ...r, kind: 'pass' }));
}

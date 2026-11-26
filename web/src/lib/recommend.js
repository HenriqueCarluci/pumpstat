// Recomendações para subir o PUMBILITY: estima a nota que o jogador tiraria em cada chart
// a partir das notas dele em charts de nível parecido, ajusta pela dificuldade do chart
// (scoring level do PIU Scores) e calcula quanto o chart somaria ao top 50.
import { chartRating, gradeFor, nextGrade, pumbility } from './piu.js';

const eff = (version, c) => (version === 'phoenix2' && c.mode === 'S' ? c.level + 1 : c.level);

export function recommendations(version, charts) {
  const pb = pumbility(version, charts);
  const full = pb.top.length >= 50;
  const floor = full ? pb.floor : 0;
  const inTop = new Map(pb.top.map((r) => [r.chart.id, r.value]));

  // perfil: notas por modo + nível (sem stage break)
  const played = charts.filter((c) => c.score != null && !c.broken && (c.mode === 'S' || c.mode === 'D'));
  const byKey = new Map();
  for (const c of played) {
    const k = `${c.mode}${c.level}`;
    if (!byKey.has(k)) byKey.set(k, []);
    const diff = c.scoringLevel != null && Math.abs(c.scoringLevel - c.level) <= 1.5 ? c.scoringLevel - c.level : 0;
    byKey.get(k).push(c.score + diff * 20000); // nota "normalizada" para um chart médio do nível
  }
  const sample = (mode, level) => {
    let w = 0, sum = 0, n = 0;
    for (const [dl, wt, adj] of [[0, 3, 0], [-1, 1, -18000], [1, 1, 18000]]) {
      const arr = byKey.get(`${mode}${level + dl}`) || [];
      // média das melhores metades: é o que o jogador tira quando a música encaixa
      const best = [...arr].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(arr.length / 2)));
      for (const s of best) { sum += (s + adj) * wt; w += wt; n++; }
    }
    return n >= 2 ? { score: sum / w, n } : null;
  };

  // mais alto nível que o jogador já passou, por modo
  const maxLv = { S: 0, D: 0 };
  for (const c of played) maxLv[c.mode] = Math.max(maxLv[c.mode], c.level);

  const fresh = [];
  for (const c of charts) {
    if (c.score != null || (c.mode !== 'S' && c.mode !== 'D') || c.level < 10) continue;
    if (c.level > maxLv[c.mode] + 1) continue;
    const base = sample(c.mode, c.level);
    if (!base) continue;
    const diff = c.scoringLevel != null && Math.abs(c.scoringLevel - c.level) <= 1.5 ? c.scoringLevel - c.level : 0;
    const expected = Math.min(1000000, Math.round(base.score - diff * 20000));
    if (expected < 800000) continue;
    const grade = gradeFor(version, expected);
    const value = chartRating(version, c.mode, c.level, expected, grade, null, false);
    const gain = value - floor;
    if (gain <= 0.5) continue;
    const confidence = Math.min(1, base.n / 6) * (diff <= 0 ? 1 : 1 - diff * 0.25);
    fresh.push({ chart: c, expected, grade, value, gain, diff, confidence, score: gain * (0.5 + confidence / 2) });
  }
  fresh.sort((a, b) => b.score - a.score);

  const improve = [];
  for (const c of played) {
    if (c.level < 10) continue;
    const nxt = nextGrade(version, c.score);
    if (!nxt) continue;
    const cur = inTop.get(c.id) ?? floor;
    const val = chartRating(version, c.mode, c.level, nxt.min, nxt.grade, c.plate, false);
    const gain = val - cur;
    if (gain > 0.5 && nxt.need <= 30000) improve.push({ chart: c, grade: nxt.grade, need: nxt.need, value: val, gain, score: gain / (1 + nxt.need / 10000) });
  }
  improve.sort((a, b) => b.score - a.score);

  const typical = pb.top.length ? Math.round(pb.top.reduce((s, r) => s + eff(version, r.chart), 0) / pb.top.length) : null;
  return { total: pb.total, floor, full, typical, fresh, improve };
}

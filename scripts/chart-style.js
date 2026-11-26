// Estilo do chart a partir das anotações de pé (L/R) do piucenter.
// Cada nota recebe zero ou mais padrões; o resultado é o % de notas em cada padrão.
// Uso: no navegador, na origem piucenter.com (ver scripts/README do catálogo).
function chartStyle(json, doubles) {
  const [taps, holds] = json;
  const ev = taps.map(([p, t, l]) => ({ p, t, l }))
    .concat((holds || []).map(([p, t0, , l]) => ({ p, t: t0, l })))
    .sort((a, b) => a.t - b.t || a.p - b.p);
  const n = ev.length;
  if (!n) return null;
  const tag = { twist: new Set(), drill: new Set(), run: new Set(), bracket: new Set(), jump: new Set(), doublestep: new Set(), jack: new Set(), footswitch: new Set() };
  // linhas (notas simultâneas)
  const rows = [];
  for (let i = 0; i < n; i++) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(ev[i].t - last.t) < 0.004) last.idx.push(i);
    else rows.push({ t: ev[i].t, idx: [i] });
  }
  const X = (p) => {
    const q = p % 5, base = doubles && p >= 5 ? 3 : 0;
    return base + (q === 2 ? 1 : q < 2 ? 0 : 2);
  };
  const pos = { l: null, r: null };
  const steps = []; // linhas de um pé só: {t, l, p (painel principal), idx}
  for (const row of rows) {
    const limbs = new Set(row.idx.map((i) => ev[i].l));
    if (row.idx.length >= 2) {
      if (limbs.size >= 2) row.idx.forEach((i) => tag.jump.add(i));
      for (const l of limbs) {
        const mine = row.idx.filter((i) => ev[i].l === l);
        if (mine.length >= 2) mine.forEach((i) => tag.bracket.add(i));
      }
    }
    for (const l of limbs) {
      const xs = row.idx.filter((i) => ev[i].l === l).map((i) => X(ev[i].p));
      pos[l] = xs.reduce((a, b) => a + b, 0) / xs.length;
    }
    if (pos.l != null && pos.r != null && (pos.l > pos.r || (pos.l === pos.r && pos.l !== 1 && pos.l !== 4))) {
      row.idx.forEach((i) => tag.twist.add(i));
    }
    if (limbs.size === 1) steps.push({ t: row.t, l: ev[row.idx[0]].l, p: ev[row.idx[0]].p, idx: row.idx });
  }
  const mark = (set, a, b) => { for (let k = a; k <= b; k++) steps[k].idx.forEach((i) => set.add(i)); };
  for (let k = 1; k < steps.length; k++) {
    const a = steps[k - 1], b = steps[k], gap = b.t - a.t;
    if (a.l === b.l && a.p !== b.p && gap < 0.6) mark(tag.doublestep, k, k);
    if (a.l === b.l && a.p === b.p && gap < 0.4) mark(tag.jack, k - 1, k);
    if (a.l !== b.l && a.p === b.p && gap < 0.5) mark(tag.footswitch, k - 1, k);
  }
  // sequências alternadas rápidas: drill (2 painéis) ou corrida (vários painéis)
  let s = 0;
  for (let k = 1; k <= steps.length; k++) {
    const ok = k < steps.length && steps[k].l !== steps[k - 1].l && steps[k].t - steps[k - 1].t <= 0.27;
    if (ok) continue;
    const len = k - s;
    if (len >= 5) {
      const panels = new Set(steps.slice(s, k).map((x) => x.p));
      if (panels.size === 2) mark(tag.drill, s, k - 1);
      else if (len >= 7) mark(tag.run, s, k - 1);
    }
    s = k;
  }
  const pct = {};
  for (const [k, set] of Object.entries(tag)) pct[k] = Math.round((set.size / n) * 1000) / 10;
  return { notes: n, pct };
}
if (typeof module !== 'undefined') module.exports = { chartStyle };

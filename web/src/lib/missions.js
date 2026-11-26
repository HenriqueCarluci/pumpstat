// Gamificação semanal: missões da semana, sequência de semanas jogadas e resumo da semana passada.
// Semana = segunda a domingo. As missões são calculadas do histórico (jogadas e recordes) e
// se completam sozinhas quando o sync traz as jogadas.
import { styleOf } from './insights.js';

const DAY = 86400000;
const WEEK = 7 * DAY;

/** Segunda-feira 00:00 (horário do aparelho) da semana de `ts`. */
export function weekStart(ts = Date.now()) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/**
 * Missões de uma semana (ws = início da semana). `lvl`/`weak` vêm do Progresso (podem faltar para quem
 * tem pouco histórico; aí ficam missões de hábito).
 */
export function weeklyMissions({ prog, attempts, mode, lvl, weak, ws = weekStart() }) {
  const we = ws + WEEK;
  const inWeek = (t) => t >= ws && t < we;
  const plays = prog.plays.filter((p) => inWeek(p.at));
  const days = new Set(plays.map((p) => dayKey(p.at))).size;
  const newClears = (L) => attempts.filter((x) => x.chart.mode === mode && x.chart.level === L && x.firstClear && inWeek(x.firstClear)).length;

  // notas melhores: chart que já tinha sido passado antes da semana e ganhou recorde maior nela
  const before = new Map();
  const improved = new Set();
  for (const h of prog.history) {
    if (h.chart.mode !== mode) continue;
    const prev = before.get(h.chart.id);
    if (h.at < ws) { if (!h.broken) before.set(h.chart.id, Math.max(prev || 0, h.score)); continue; }
    if (inWeek(h.at) && !h.broken && prev != null && h.score > prev) improved.add(h.chart.id);
  }

  const weakP = (weak || []).find((w) => w.index >= 6 && w.confidence !== 'low')?.id || (weak || []).find((w) => w.index > 0)?.id || null;
  const weakPlays = weakP ? plays.filter((p) => p.chart.mode === mode && (styleOf(prog, p.chart)?.pct[weakP] || 0) >= 20).length : 0;

  const list = [
    { id: 'days', goal: 2, cur: days, vars: { n: 2 } },
  ];
  if (lvl) {
    list.push({ id: 'clear_prev', goal: 2, cur: newClears(lvl.target - 1), vars: { n: 2, m: mode, L: lvl.target - 1 } });
    list.push({ id: 'clear_target', goal: 1, cur: newClears(lvl.target), vars: { n: 1, m: mode, L: lvl.target } });
    list.push({ id: 'improve', goal: 3, cur: improved.size, vars: { n: 3 } });
    if (weakP) list.push({ id: 'weak', goal: 4, cur: weakPlays, vars: { n: 4, p: weakP } });
  } else {
    list.push({ id: 'plays', goal: 10, cur: plays.length, vars: { n: 10 } });
  }
  const missions = list.map((m) => ({ ...m, cur: Math.min(m.cur, m.goal), done: m.cur >= m.goal }));
  return { ws, missions, done: missions.filter((m) => m.done).length, total: missions.length, plays: plays.length, days };
}

/** Sequência de semanas com jogo, a partir das semanas (datas yyyy-mm-dd de segunda) vindas do servidor. */
export function weekStreak(weeks, current) {
  const set = new Set(weeks || []);
  const shift = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const playedNow = set.has(current);
  let start = playedNow ? current : shift(current, -7);
  let streak = 0;
  while (set.has(start)) { streak++; start = shift(start, -7); }
  // recorde: maior sequência no histórico
  const sorted = [...set].sort();
  let best = 0, run = 0, prev = null;
  for (const w of sorted) { run = prev && shift(prev, 7) === w ? run + 1 : 1; best = Math.max(best, run); prev = w; }
  return { streak, best: Math.max(best, streak), playedNow, atRisk: !playedNow && streak > 0 };
}

/** Resumo da semana passada (para o cartão de segunda-feira). */
export function lastWeekSummary({ prog, attempts, mode, lvl, weak, week }) {
  const ws = weekStart() - WEEK;
  const we = ws + WEEK;
  const inWeek = (t) => t >= ws && t < we;
  const plays = prog.plays.filter((p) => inWeek(p.at));
  const firstClears = attempts.filter((x) => x.firstClear && inWeek(x.firstClear))
    .sort((a, b) => (b.chart.level - a.chart.level) || (a.chart.mode === 'D' ? -1 : 1));
  const improved = new Set();
  const best = new Map();
  for (const h of prog.history) {
    const prev = best.get(h.chart.id);
    if (!h.broken && inWeek(h.at) && prev != null && h.score > prev) improved.add(h.chart.id);
    if (!h.broken) best.set(h.chart.id, Math.max(prev || 0, h.score));
  }
  const m = weeklyMissions({ prog, attempts, mode, lvl, weak, ws });
  const pbStart = week?.pb?.start != null ? Number(week.pb.start) : null;
  const pbEnd = week?.pb?.end != null ? Number(week.pb.end) : null;
  const r = week?.rival;
  return {
    ws, plays: plays.length, days: new Set(plays.map((p) => dayKey(p.at))).size,
    clears: firstClears.length, topClears: firstClears.slice(0, 3).map((x) => x.chart),
    improved: improved.size, missions: { done: m.done, total: m.total },
    pb: pbStart != null && pbEnd != null ? { start: pbStart, end: pbEnd, delta: Math.round((pbEnd - pbStart) * 100) / 100 } : null,
    rival: r ? {
      id: r.id, nickname: r.nickname, avatar: r.avatar, plays: r.plays || 0,
      delta: r.start != null && r.end != null ? Math.round((Number(r.end) - Number(r.start)) * 100) / 100 : null,
    } : null,
    empty: !plays.length && !firstClears.length && !improved.size,
  };
}

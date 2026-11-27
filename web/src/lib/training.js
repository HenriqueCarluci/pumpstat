// Meu treino: a lista de charts que a pessoa quer treinar, guardada na conta (sincroniza entre aparelhos).
import { useEffect, useState } from 'react';
import { rpc } from './api.js';
import {
  byPattern, chartAttempts, DIMENSIONS, levelStats, parseProgress, playerLevel, styleOf, weaknessSums, weaknesses,
} from './insights.js';
import { chartTier, nextGrade } from './piu.js';
import { hasGimmick } from './special.js';

let ids = null;            // Map(chartId -> addedAt ms)
let loading = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(ids));
const fromRows = (rows) => new Map((rows || []).map(([id, at]) => [id, at * 1000]));

export function loadTraining(force = false) {
  if (!force && ids) return Promise.resolve(ids);
  if (!force && loading) return loading;
  loading = rpc('my_training').then((rows) => { ids = fromRows(rows); emit(); return ids; }).finally(() => { loading = null; });
  return loading;
}

export async function setTraining(chartId, on) {
  const rows = await rpc('training_set', { p_chart: chartId, p_on: on });
  ids = fromRows(rows); emit();
  return ids;
}

/** Lista do treino (Map chartId -> data em que entrou) e se está carregada. */
export function useTraining() {
  const [list, setList] = useState(ids);
  useEffect(() => {
    listeners.add(setList);
    // lista vazia pode ter vindo de uma sessão que ainda não tinha o login renovado: busca de novo
    if (!ids || !ids.size) loadTraining(!!ids).catch(() => {});
    const onShow = () => { if (!document.hidden) loadTraining(true).catch(() => {}); };
    document.addEventListener('visibilitychange', onShow);
    return () => { listeners.delete(setList); document.removeEventListener('visibilitychange', onShow); };
  }, []);
  return list;
}

const TIER_ADJ = { fundo: 15, baixo: 10, medio_baixo: 5, medio: 0, unknown: 0, medio_alto: -4, alto: -9, topo: -15 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Chance estimada só pela distância do nível do jogador. */
function byDistance(level, lvl) {
  if (!lvl) return 30;
  const d = level - lvl.comfort;
  return d <= -1 ? 92 : d === 0 ? 80 : d === 1 ? 55 : d === 2 ? 32 : d === 3 ? 16 : 7;
}

/**
 * Análise de cada chart do treino: chance de passar, por quê, e o que treinar antes.
 * Usa o histórico de jogadas (passes e quebras por nível), o tier do chart, o estilo (padrões)
 * cruzado com os pontos fortes e fracos do jogador, e as tentativas naquele chart.
 */
export function analyzeTraining(raw, data, list, version) {
  const prog = parseProgress(raw, data);
  const attempts = chartAttempts(data, prog);
  const byId = new Map(attempts.map((r) => [r.chart.id, r]));
  const ctx = {};
  for (const m of ['S', 'D']) {
    const stats = levelStats(attempts, m);
    const lvl = playerLevel(stats);
    ctx[m] = { stats, lvl, weak: weaknesses(weaknessSums(attempts, prog, m, lvl)) };
  }
  // jogadas de cada chart, da mais antiga para a mais nova (para mostrar a evolução)
  const playsBy = new Map();
  for (const p of prog.plays) {
    if (!list.has(p.chart.id)) continue;
    if (!playsBy.has(p.chart.id)) playsBy.set(p.chart.id, []);
    playsBy.get(p.chart.id).push({ at: p.at, score: p.score, grade: p.grade, broken: p.broken, miss: p.miss });
  }
  for (const arr of playsBy.values()) arr.sort((a, b) => a.at - b.at);
  const out = [];
  for (const [id, added] of list) {
    const c = data.byId.get(id);
    if (!c) continue;
    const m = c.mode === 'S' || c.mode === 'D' ? c.mode : null;
    const k = m ? ctx[m] : { stats: [], lvl: null, weak: [] };
    const att = byId.get(id);
    const cleared = (c.score != null && !c.broken) || !!att?.cleared;
    const reasons = [];
    const history = playsBy.get(id) || [];
    const since = history.filter((h) => h.at >= added);
    const firstPass = history.find((h) => !h.broken);
    const item = {
      chart: c, added, cleared, reasons, train: [], attempts: att?.attempts || 0, fails: att?.fails || 0,
      history, triesSince: since.length, failsSince: since.filter((h) => h.broken).length,
      clearedAt: firstPass?.at || null,
      // passou depois de colocar no treino (a conquista do treino)
      clearedInTraining: !!firstPass && firstPass.at >= added,
      last: history[history.length - 1] || null,
    };
    if (cleared) {
      item.chance = 100;
      item.next = c.score != null ? nextGrade(version, c.score) : null;
      out.push(item);
      continue;
    }
    // 1. nível: quanto a pessoa passa nesse nível (e a distância do nível de conforto)
    const st = k.stats.find((s) => s.level === c.level);
    let chance = byDistance(c.level, k.lvl);
    if (st && st.charts >= 3) {
      const rate = Math.round((st.cleared / st.charts) * 100);
      chance = 0.6 * rate + 0.4 * chance;
      reasons.push({ id: 'level', tone: rate >= 60 ? 'good' : rate >= 30 ? 'mid' : 'bad', vars: { r: rate, m: c.mode, L: c.level } });
    } else if (k.lvl) {
      reasons.push({ id: c.level > k.lvl.ceiling ? 'above' : 'near', tone: c.level > k.lvl.ceiling ? 'bad' : 'mid', vars: { m: c.mode, L: k.lvl.ceiling } });
    }
    // 2. tier do chart dentro do nível
    const tier = chartTier(c);
    chance += TIER_ADJ[tier] || 0;
    if (tier === 'fundo' || tier === 'baixo' || tier === 'medio_baixo') reasons.push({ id: 'easy', tone: 'good' });
    if (tier === 'alto' || tier === 'topo' || tier === 'medio_alto') reasons.push({ id: 'hard', tone: 'bad' });
    // 3. padrões do chart x pontos fortes e fracos
    const style = styleOf(prog, c);
    const tops = style ? DIMENSIONS.map((p) => [p, style.pct[p] || 0]).filter(([, v]) => v >= 20).sort((a, b) => b[1] - a[1]).slice(0, 2) : [];
    for (const [p] of tops) {
      const w = k.weak.find((x) => x.id === p && x.confidence !== 'low');
      if (!w) continue;
      chance -= clamp(w.index, -12, 15) * 0.8;
      if (w.index >= 4) {
        reasons.push({ id: 'weak', tone: 'bad', vars: { p } });
        if (m && !item.train.length) item.train = byPattern(data, attempts, prog, m, [c.level - 2, c.level - 1], p, 3);
        item.focus = item.focus || p;
      } else if (w.index <= -4) reasons.push({ id: 'strong', tone: 'good', vars: { p } });
    }
    // 4. gimmick marcado pela comunidade
    if (hasGimmick(c) && !tops.some(([p]) => p === 'gimmick')) { chance -= 8; reasons.push({ id: 'gimmick', tone: 'bad' }); }
    // 5. tentativas nesse chart
    if (item.fails > 0) { chance -= Math.min(16, item.fails * 4); reasons.push({ id: 'fails', tone: 'bad', vars: { n: item.fails } }); }
    if (!item.train.length && m && c.level > 2) {
      // sem padrão fraco: treinar charts do nível de baixo que ainda não passou, do mais fácil
      const done = new Set(attempts.filter((r) => r.cleared).map((r) => r.chart.id));
      item.train = data.charts.filter((x) => x.mode === m && x.level === c.level - 1 && !done.has(x.id) && !(x.score != null && !x.broken))
        .sort((a, b) => (TIER_ADJ[chartTier(b)] || 0) - (TIER_ADJ[chartTier(a)] || 0)).slice(0, 3);
    }
    item.chance = Math.round(clamp(chance, 3, 97));
    out.push(item);
  }
  return out;
}

export const chanceLabel = (n) => (n >= 100 ? 'Já passou' : n >= 65 ? 'Perto de passar' : n >= 35 ? 'Dá para tentar' : 'Precisa treinar');

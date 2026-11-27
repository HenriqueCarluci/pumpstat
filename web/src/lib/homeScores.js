// Treino em casa: recordes de simuladores (StepP1, XSanity) lidos do Stats.xml do perfil (formato do StepMania 5).
// Fica separado do fliperama; a pessoa escolhe ver separado ou consolidado com a Phoenix 2 (só para ela, no app).
import { useEffect, useState } from 'react';
import { rpc } from './api.js';
import { gradeFor } from './piu.js';
import { isOn } from './plans.js';

export const SOURCES = { stepp1: 'StepP1', xsanity: 'XSanity', stepf2: 'StepF2', other: 'Outro simulador' };

/** Título normalizado para casar a pasta da música com o catálogo. */
export const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, '');

/** Nome da música a partir da pasta (ex.: "Songs/14 - XX/1416 - Twist of Fate/" → "Twist of Fate"). */
export function titleFromDir(dir) {
  const parts = String(dir || '').replace(/\\/g, '/').split('/').filter(Boolean);
  let last = parts[parts.length - 1] || '';
  last = last.replace(/^\[?[0-9A-F]{3,5}\]?\s*[-_.]\s*/i, '').replace(/^\d+\s*[-_.]\s*/, '');
  return last.trim();
}

const num = (el, tag) => {
  const x = el?.getElementsByTagName(tag)?.[0]?.textContent;
  return x == null || x === '' ? null : Number(x);
};
const txt = (el, tag) => el?.getElementsByTagName(tag)?.[0]?.textContent ?? null;

/** Modo e nível de um <Steps>: pelo StepsType e pelo Meter ou pela descrição (ex.: "S21", "D23", "DP 4"). */
export function stepsKey(steps) {
  const type = (steps.getAttribute('StepsType') || '').toLowerCase();
  const desc = `${steps.getAttribute('Description') || ''} ${steps.getAttribute('Difficulty') || ''}`;
  let mode = /double|halfdouble/.test(type) ? 'D' : /single/.test(type) ? 'S' : /routine|couple/.test(type) ? 'C' : null;
  const m = desc.match(/\b(SP|DP|S|D|HD|CO-?OP)\s*-?\s*(\d{1,2})\b/i);
  let level = Number(steps.getAttribute('Meter')) || null;
  if (m) {
    const k = m[1].toUpperCase();
    if (k === 'SP') mode = 'SP'; else if (k === 'DP') mode = 'DP'; else if (k.startsWith('CO')) mode = 'C'; else if (k === 'HD') mode = 'HD'; else mode = mode || k;
    level = level || Number(m[2]);
  }
  return { mode, level };
}

/**
 * Lê o Stats.xml e casa com o catálogo. Devolve { rows (para salvar), matched, unmatched, profile }.
 * Melhor jogada de cada chart: a de maior score que não quebrou (ou a maior, se todas quebraram).
 */
export function parseStats(xmlText, data, version = 'phoenix2') {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo inválido: não é um Stats.xml');
  const songsByTitle = new Map();
  for (const c of data.charts) {
    const k = norm(c.song.title);
    if (!songsByTitle.has(k)) songsByTitle.set(k, c.song);
  }
  const profile = txt(doc, 'DisplayName');
  const rows = [], unmatched = [];
  const songs = [...doc.getElementsByTagName('Song')];
  for (const song of songs) {
    const dir = song.getAttribute('Dir') || '';
    const title = titleFromDir(dir);
    const s = songsByTitle.get(norm(title));
    for (const steps of [...song.getElementsByTagName('Steps')]) {
      const { mode, level } = stepsKey(steps);
      const list = steps.getElementsByTagName('HighScoreList')[0];
      const scores = [...(list?.getElementsByTagName('HighScore') || [])];
      if (!scores.length) continue;
      const parsed = scores.map((h) => {
        const tap = h.getElementsByTagName('TapNoteScores')[0];
        const grade = txt(h, 'Grade') || '';
        return {
          score: num(h, 'Score'), broken: /fail/i.test(grade), at: txt(h, 'DateTime'),
          perfect: (num(tap, 'W1') || 0) + (num(tap, 'W2') || 0), great: num(tap, 'W3'), good: num(tap, 'W4'), bad: num(tap, 'W5'), miss: num(tap, 'Miss'),
        };
      }).filter((p) => p.score != null);
      if (!parsed.length) continue;
      const best = parsed.reduce((a, b) => ((!b.broken && a.broken) || (b.broken === a.broken && b.score > a.score) ? b : a));
      const chart = s && mode && level ? s.charts.find((c) => c.mode === mode && c.level === level) : null;
      const item = { title, mode, level, score: best.score, broken: best.broken };
      if (!chart) { unmatched.push({ ...item, reason: !s ? 'song' : 'chart' }); continue; }
      rows.push({
        chart: chart.id, score: best.score, grade: best.broken ? null : gradeFor(version, best.score), broken: best.broken,
        plays: num(list, 'NumTimesPlayed'), last_played: txt(list, 'LastPlayed') || best.at,
        perfect: best.perfect, great: best.great, good: best.good, bad: best.bad, miss: best.miss,
        _chart: chart,
      });
    }
  }
  return { rows, unmatched, profile, songs: songs.length };
}

/** Configuração do treino em casa (null enquanto carrega ou se o recurso estiver desligado). */
export function useHomeSettings(plan) {
  const on = isOn(plan, 'home_import');
  const [s, setS] = useState(null);
  useEffect(() => {
    if (!on) { setS(null); return; }
    rpc('my_home_settings').then(setS).catch(() => setS(null));
  }, [on]);
  return [s, setS];
}

/** Melhor recorde de casa por chart (entre os simuladores). */
export function homeBest(list) {
  const m = new Map();
  for (const [chart, source, score, grade, broken, plays, last, perfect, great, good, bad, miss] of list || []) {
    const r = { chart, source, score, grade, broken: !!broken, plays, last, perfect, great, good, bad, miss };
    const b = m.get(chart);
    if (!b || (!r.broken && b.broken) || (r.broken === b.broken && (r.score || 0) > (b.score || 0))) m.set(chart, r);
  }
  return m;
}

/**
 * Junta os recordes de casa aos dados da versão. Separado: só anexa `home` em cada chart.
 * Consolidado: o chart passa a usar o recorde de casa quando ele é melhor (marcado com fromHome).
 */
export function withHome(data, best, mode) {
  if (!data || !best?.size) return data;
  const songs = new Map();
  const charts = [], byId = new Map();
  for (const c0 of data.charts) {
    const h = best.get(c0.id);
    let c = c0;
    if (h) {
      c = { ...c0, home: h };
      const better = !h.broken && (c0.score == null || c0.broken || (h.score || 0) > c0.score);
      if (mode === 'merged' && better) {
        c = { ...c, score: h.score, grade: h.grade, plate: null, broken: false, achievedAt: h.last || c0.achievedAt, fromHome: h.source, arcade: { score: c0.score, grade: c0.grade, plate: c0.plate, broken: c0.broken } };
      }
    }
    let s = songs.get(c0.song.id);
    if (!s) { s = { ...c0.song, charts: [] }; songs.set(s.id, s); }
    c.song = s;
    s.charts.push(c);
    charts.push(c);
    byId.set(c.id, c);
  }
  return { ...data, charts, byId, songs: (data.songs || []).map((x) => songs.get(x.id)).filter(Boolean), home: { mode, count: best.size } };
}

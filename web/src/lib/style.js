// Estilo dos charts: % das notas em cada padrão (calculado das anotações de pé do piucenter.com).
import { useEffect, useState } from 'react';
import { rpc } from './api.js';
import { API_URL } from './config.js';

export const STYLE_KEYS = [
  { id: 'twist', label: 'Twist', color: '#ff5d8f', tip: 'Pés cruzados ou de lado' },
  { id: 'drill', label: 'Drill', color: '#ffb02e', tip: 'Alternar rápido entre 2 setas' },
  { id: 'run', label: 'Corrida', color: '#42c6ff', tip: 'Sequência rápida alternando os pés' },
  { id: 'bracket', label: 'Bracket', color: '#a77bff', tip: 'Duas setas com o mesmo pé' },
  { id: 'jump', label: 'Pulo', color: '#4be38a', tip: 'Duas setas com os dois pés' },
  { id: 'jack', label: 'Jack', color: '#ff8a4c', tip: 'Mesma seta repetida com o mesmo pé' },
  { id: 'doublestep', label: 'Doublestep', color: '#c7d0dd', tip: 'Dois passos seguidos com o mesmo pé' },
  { id: 'footswitch', label: 'Footswitch', color: '#7de3d9', tip: 'Troca de pé na mesma seta' },
];

const TAG_PT = {
  jump: 'pulos', drill: 'drill', run: 'corrida', anchor_run: 'corrida ancorada', run_without_twists: 'corrida sem twist',
  twists: 'twists', side3_singles: 'lateral (3 setas)', mid6_doubles: 'meio (6 setas)', mid4_doubles: 'meio (4 setas)',
  doublestep: 'doublestep', jack: 'jack', footswitch: 'footswitch', bracket: 'bracket', staggered_bracket: 'bracket escalonado',
  bracket_run: 'corrida de bracket', bracket_drill: 'drill de bracket', bracket_jump: 'pulo de bracket', bracket_twist: 'twist de bracket',
  '5-stair': 'escada de 5', '10-stair': 'escada de 10', yog_walk: 'yog walk', 'cross-pad_transition': 'troca de pad',
  'co-op_pad_transition': 'troca de pad (co-op)', split: 'split', hold_footslide: 'footslide em hold', hold_footswitch: 'footswitch em hold',
  hands: 'mãos', bursty: 'explosões', sustained: 'resistência',
};
export const tagPt = (t) => TAG_PT[t] || t.replace(/_/g, ' ');

const cache = new Map(); // songId -> Map(`${mode}${level}` -> style)

function store(rows) {
  for (const [songId, mode, level, nps, bpmInfo, tags, pct, notes] of rows) {
    if (!cache.has(songId)) cache.set(songId, new Map());
    const st = { nps: nps == null ? null : Number(nps), bpmInfo, tags: tags || [], notes, pct: {} };
    STYLE_KEYS.forEach((k, i) => { st.pct[k.id] = pct?.[i] == null ? 0 : Number(pct[i]); });
    cache.get(songId).set(`${mode}${level}`, st);
  }
}

/** Busca (com cache) o estilo dos charts das músicas pedidas. Retorna (chart) => style | null. */
export function useStyles(songIds) {
  const key = [...new Set(songIds)].sort((a, b) => a - b).join(',');
  const [, setTick] = useState(0);
  useEffect(() => {
    const missing = key ? key.split(',').map(Number).filter((id) => !cache.has(id)) : [];
    if (!missing.length) return;
    let alive = true;
    rpc('song_styles', { p_songs: missing }).then((rows) => {
      store(rows);
      missing.forEach((id) => { if (!cache.has(id)) cache.set(id, new Map()); });
      if (alive) setTick((t) => t + 1);
    }).catch(() => {});
    return () => { alive = false; };
  }, [key]);
  return (c) => cache.get(c.songId)?.get(`${c.mode}${c.level}`) || null;
}

/** Os padrões mais fortes do chart, para resumos curtos. */
export const topStyles = (st, n = 3) => (st ? STYLE_KEYS.map((k) => ({ ...k, v: st.pct[k.id] }))
  .filter((k) => k.v >= 5).sort((a, b) => b.v - a.v).slice(0, n) : []);

/**
 * Link que abre direto o vídeo do chart ('c') ou da música ('s'); o servidor guarda o vídeo achado.
 * Sem vídeo achado, o servidor abre a busca do YouTube (q é a mesma busca de antes, usada se algo falhar).
 */
export const videoUrl = (kind, id, title, label) =>
  `${API_URL}/api/video/${kind}/${id}?q=${encodeURIComponent(`pump it up ${title || ''} ${label || ''}`.replace(/\s+/g, ' ').trim())}`;

export const youtubeUrl = (title, label) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`pump it up ${title} ${label || ''}`.trim())}`;

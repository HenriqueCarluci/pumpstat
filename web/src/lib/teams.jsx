// Times: tag do time ao lado do nick (busca em lote, com cache curto).
import { useEffect, useState } from 'react';
import { rpc } from './api.js';
import { useData } from '../App.jsx';
import { isOn } from './plans.js';

const cache = new Map(); // userId -> { id, name, tag } | null
let pending = null;
const wanted = new Set();

function flush() {
  const ids = [...wanted].filter((id) => !cache.has(id));
  wanted.clear();
  pending = null;
  if (!ids.length) return Promise.resolve();
  return rpc('teams_of', { p_users: ids.slice(0, 300) }).then((m) => {
    for (const id of ids) cache.set(id, m?.[id] || null);
  }).catch(() => {});
}

/** Mapa userId -> time para uma lista de usuários. */
export function useTeams(ids) {
  const key = (ids || []).filter(Boolean).sort().join(',');
  const [, setTick] = useState(0);
  useEffect(() => {
    const list = key ? key.split(',') : [];
    const missing = list.filter((id) => !cache.has(id));
    if (!missing.length) return;
    missing.forEach((id) => wanted.add(id));
    if (!pending) pending = new Promise((r) => setTimeout(r, 30)).then(flush);
    pending.then(() => setTick((x) => x + 1));
  }, [key]);
  return (id) => cache.get(id) || null;
}

export const forgetTeam = (id) => cache.delete(id);

export function TeamLogo({ team, size = 16 }) {
  if (!team?.logo) return null;
  return <img className="team-logo" src={team.logo} alt="" width={size} height={size} loading="lazy" />;
}

export function TeamTag({ team }) {
  const { plan } = useData() || {};
  if (!team || !isOn(plan, 'teams')) return null;
  return <span className={`team-tag ${team.logo ? 'has-logo' : ''}`} title={team.name}>{team.logo && <TeamLogo team={team} size={14} />}{team.tag || team.name}</span>;
}

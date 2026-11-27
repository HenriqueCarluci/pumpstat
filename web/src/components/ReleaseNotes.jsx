// Novidades do app (release notes): o que foi lançado e o que vem por aí. Conteúdo editado no admin.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { getLang, locale, t } from '../lib/i18n.js';
import { ChevronRight, Megaphone, X } from './Icons.jsx';

const SEEN_KEY = 'pumpstat:notes-seen';
export const NOTE_TAGS = { new: 'Novo', improved: 'Melhoria', fixed: 'Correção' };

let cache = null;
let inflight = null;
const listeners = new Set();

function load(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight) {
    inflight = rpc('release_notes')
      .then((r) => { cache = Array.isArray(r) ? r : []; listeners.forEach((f) => f(cache)); return cache; })
      .catch(() => cache || [])
      .finally(() => { inflight = null; });
  }
  return inflight;
}
export const reloadNotes = () => load(true);

export function useReleaseNotes() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    listeners.add(setList);
    load().then(setList);
    return () => listeners.delete(setList);
  }, []);
  return list;
}

/** Texto no idioma da pessoa, caindo no português. */
export const pick = (o) => (o && (o[getLang()] || o.pt)) || '';
/** Data estimada de um próximo lançamento: o mês ("dezembro de 2026") ou o dia exato. */
export const fmtEta = (n) => {
  if (!n?.eta) return null;
  const d = new Date(`${n.eta}T12:00:00`);
  return n.eta_precision === 'day'
    ? d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
    : d.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
};
export const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const maxReleased = (list) => Math.max(0, ...(list || []).filter((n) => n.status === 'released').map((n) => Number(n.id)));
function seenId() { try { const v = localStorage.getItem(SEEN_KEY); return v == null ? null : Number(v); } catch { return 0; } }
export function markNotesSeen(list) {
  const m = maxReleased(list);
  try { if (m) localStorage.setItem(SEEN_KEY, String(m)); } catch { /* ignora */ }
  window.dispatchEvent(new Event('pumpstat:notes-seen'));
}

/** Novidades lançadas que a pessoa ainda não viu. Na primeira vez, nada conta como novo. */
export function useUnseenNotes() {
  const list = useReleaseNotes();
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    window.addEventListener('pumpstat:notes-seen', f);
    return () => window.removeEventListener('pumpstat:notes-seen', f);
  }, []);
  useEffect(() => { if (list?.length && seenId() == null) markNotesSeen(list); }, [list]);
  if (!list) return [];
  const seen = seenId();
  if (seen == null) return [];
  return list.filter((n) => n.status === 'released' && Number(n.id) > seen);
}

export function NoteItem({ n }) {
  const body = pick(n.body);
  return (
    <li className={`rn-item ${n.status}`}>
      <div className="rn-top">
        <span className={`rn-tag ${n.status === 'soon' ? 'soon' : n.tag}`}>{n.status === 'soon' ? t('Em breve') : t(NOTE_TAGS[n.tag] || 'Novo')}</span>
        {n.status === 'released' && n.released_on && <small className="muted">{fmtDay(n.released_on)}</small>}
        {n.status === 'soon' && <small className="rn-eta">{fmtEta(n) ? t('Previsão: {d}', { d: fmtEta(n) }) : t('Previsão a definir')}</small>}
      </div>
      <b className="rn-title">{pick(n.title)}</b>
      {body && <p className="muted small">{body}</p>}
    </li>
  );
}

/** Cartão em Ajustes: últimos lançamentos e quantos vêm por aí. */
export function NotesCard() {
  const list = useReleaseNotes();
  const unseen = useUnseenNotes();
  if (!list?.length) return null;
  const released = list.filter((n) => n.status === 'released').slice(0, 3);
  const soon = list.filter((n) => n.status === 'soon').length;
  return (
    <section className="card rn-card" id="novidades">
      <div className="row-between">
        <h3 className="ic-row"><Megaphone size={18} /> {t('Novidades')}{unseen.length > 0 && <span className="rn-dot" aria-label={t('{n} novas', { n: unseen.length })}>{unseen.length}</span>}</h3>
        <Link to="/novidades" className="btn ghost">{t('Ver tudo')}</Link>
      </div>
      <ul className="rn-list compact">{released.map((n) => <NoteItem key={n.id} n={n} />)}</ul>
      {soon > 0 && <Link to="/novidades?aba=proximos" className="rn-soon-link small">{t('{n} lançamentos a caminho', { n: soon })} <ChevronRight size={14} /></Link>}
    </section>
  );
}

/** Aviso discreto no início quando sai novidade. */
export function NewsBanner() {
  const unseen = useUnseenNotes();
  const list = useReleaseNotes();
  if (!unseen.length) return null;
  const first = unseen[0];
  return (
    <div className="rn-banner">
      <Megaphone size={16} />
      <Link to="/novidades" className="rn-banner-text">
        <b>{unseen.length > 1 ? t('{n} novidades no app', { n: unseen.length }) : t('Novidade')}</b>
        <span>{pick(first.title)}</span>
      </Link>
      <button type="button" className="icon-btn" aria-label={t('Dispensar')} onClick={() => markNotesSeen(list)}><X size={16} /></button>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { currentUserId, getSession } from '../lib/auth.js';
import {
  backFromAway, joinQueue, leaveQueue, passTurn, queueEntries, recentEvents, resetQueue, setAway, subscribeQueue, toFront, venueData,
} from '../lib/queue.js';
import { locale, t, tErr } from '../lib/i18n.js';
import { rememberVenue } from '../lib/presence.js';

const MY_ENTRIES = 'stepclub:queue-entries';
const myEntryIds = () => { try { return JSON.parse(localStorage.getItem(MY_ENTRIES) || '{}'); } catch { return {}; } };
const rememberEntry = (machine, id) => { try { localStorage.setItem(MY_ENTRIES, JSON.stringify({ ...myEntryIds(), [machine]: id })); } catch { /* ignore */ } };

// entrar na fila (e voltar de ausente) sempre pede a localização; o raio só é conferido onde o local tem coordenadas
const needsCheckin = () => true;
const hasRadius = (v) => v.venue.latitude != null;
const mins = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const EVENT_PT = { join: 'entrou', pass: 'passou a vez', leave: 'saiu', away: 'ficou ausente', back: 'voltou', remove: 'foi removido', reset: 'fila zerada', expire: 'saiu (ausente 1 h)' };
const evText = (k) => (EVENT_PT[k] ? t(EVENT_PT[k]) : k);

export function useVenue(slug) {
  const [venue, setVenue] = useState(null);
  const [entries, setEntries] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [, tick] = useState(0);

  const machineIds = useMemo(() => (venue?.machines || []).map((m) => m.id), [venue]);
  const refresh = useCallback(async () => {
    if (!machineIds.length) return;
    try {
      const [e, ev] = await Promise.all([queueEntries(machineIds), recentEvents(machineIds)]);
      setEntries(e); setEvents(ev); setError('');
    } catch (ex) { setError(tErr(ex.message)); }
  }, [machineIds]);

  useEffect(() => { venueData(slug).then((v) => (v ? setVenue(v) : setError(t('Local não encontrado.')))).catch((e) => setError(tErr(e.message))); }, [slug]);
  useEffect(() => {
    if (!machineIds.length) return undefined;
    refresh();
    const unsub = subscribeQueue(machineIds, refresh);
    const poll = setInterval(refresh, 15000);         // reserva caso o tempo real caia
    const clock = setInterval(() => tick((n) => n + 1), 30000);
    return () => { unsub(); clearInterval(poll); clearInterval(clock); };
  }, [machineIds, refresh]);

  return { venue, entries, events, error, refresh };
}

export default function Queue() {
  const { slug } = useParams();
  const { venue, entries, events, error, refresh } = useVenue(slug);
  useEffect(() => { rememberVenue(slug); }, [slug]);
  const [showRules, setShowRules] = useState(false);

  if (error && !venue) return <div className="page"><p className="empty">{error}</p></div>;
  if (!venue) return <div className="page"><p className="empty">{t('Carregando a fila…')}</p></div>;

  return (
    <div className="page queue-page">
      <header className="q-head">
        <div>
          <Link to="/fila" className="q-city">‹ {venue.venue.city}</Link>
          <h1>{venue.venue.name}</h1>
          {venue.venue.address && (
            <a className="q-addr" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${venue.venue.latitude && venue.venue.longitude ? `${venue.venue.latitude},${venue.venue.longitude}` : encodeURIComponent(venue.venue.address)}`}>
              📍 {venue.venue.address}
            </a>
          )}
          <div className="q-geo small">{hasRadius(venue) ? t('Check-in por localização: só entra na fila quem estiver a até {n} m.', { n: venue.venue.radius_m }) : t('Para entrar na fila, permita o acesso à localização.')}</div>
        </div>
        <div className="q-head-actions">
          <Link className="btn ghost" to={`/fila/${slug}/tv`}>{t('Modo TV')}</Link>
          <button className="btn ghost" onClick={() => setShowRules(true)}>{t('Regras')}</button>
        </div>
      </header>
      {error && <div className="banner err">{error}</div>}
      {venue.machines.map((m) => (
        <MachineQueue key={m.id} machine={m} isAdmin={venue.is_admin} checkin={needsCheckin(venue)}
          entries={entries.filter((e) => e.machine_id === m.id)} onChange={refresh} />
      ))}
      {events.length > 0 && (
        <section className="card q-log">
          <h3>{t('Movimento')}</h3>
          {events.map((ev) => (
            <div key={ev.id} className="small"><span className="muted">{new Date(ev.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</span>{' '}
              {ev.entry_name && ev.kind !== 'reset' ? <b>{ev.entry_name}</b> : null} {evText(ev.kind)}{ev.kind === 'reset' && ev.entry_name ? ` (${ev.entry_name})` : ''}</div>
          ))}
        </section>
      )}
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}

function MachineQueue({ machine, entries, isAdmin, checkin, onChange }) {
  const uid = currentUserId();
  const mine = entries.find((e) => (uid && e.user_id === uid) || myEntryIds()[machine.id] === e.id);
  const [name, setName] = useState(() => { try { return localStorage.getItem('stepclub:queue-name') || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const waiting = entries.filter((e) => e.status === 'waiting');
  const playing = waiting[0];
  const myPos = mine && mine.status === 'waiting' ? waiting.findIndex((e) => e.id === mine.id) : -1;
  const waitMin = myPos > 0 ? Math.round((myPos * machine.avg_turn_sec) / 60) : null;

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await onChange(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const join = (e) => {
    e.preventDefault();
    try { localStorage.setItem('stepclub:queue-name', name); } catch { /* ignore */ }
    act(async () => { const id = await joinQueue(machine.id, name, checkin); rememberEntry(machine.id, id); });
  };

  return (
    <section className="card q-machine">
      <div className="row-between">
        <h3>{machine.name}</h3>
        <span className="muted small">{t('{n} na fila · ~{m} min por vez', { n: entries.length, m: Math.round(machine.avg_turn_sec / 60) })}</span>
      </div>

      {playing ? (
        <div className="q-now">
          <span className="q-now-label">{t('Jogando agora')}</span>
          <Person entry={playing} big />
        </div>
      ) : <p className="muted center">{t('Fila vazia, bora jogar! Coloque seu nome aqui embaixo.')}</p>}

      <ol className="q-list">
        {entries.filter((e) => e !== playing).map((e) => (
          <li key={e.id} className={`${e.status === 'away' ? 'away' : ''} ${mine?.id === e.id ? 'me' : ''}`}>
            <Person entry={e} />
            {e.status === 'away' && <span className="tag">{t('ausente há {n} min', { n: mins(e.away_since) })}</span>}
            {isAdmin && (
              <span className="q-admin">
                <button className="link" onClick={() => act(() => toFront(e.id))} title={t('Mover para o topo')}>⤒</button>
                <button className="link" onClick={() => act(() => leaveQueue(e.id))} title={t('Remover')}>✕</button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {err && <div className="form-err">{err}</div>}

      <button className="btn wide q-pass" disabled={busy || !playing} onClick={() => act(() => passTurn(machine.id))}>{t('Passar a vez')} ⏭</button>

      {mine ? (
        <div className="q-mine">
          <div className="small">
            {mine.status === 'away' ? t('Você está marcado como ausente.')
              : myPos === 0 ? <b>{t('É a sua vez!')}</b>
                : <>{t('Sua posição na fila: {n}', { n: myPos + 1 })}{waitMin != null ? ` · ${t('espera ~{n} min', { n: waitMin })}` : ''}</>}
          </div>
          <div className="bm-row">
            <button className="btn ghost" disabled={busy} onClick={() => act(() => (mine.status === 'away' ? backFromAway(mine.id, checkin) : setAway(mine.id, true)))}>
              {mine.status === 'away' ? t('Voltei') : t('Estou ausente')}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => act(() => leaveQueue(mine.id))}>{t('Sair da fila')}</button>
          </div>
        </div>
      ) : (
        <form className="q-join" onSubmit={join}>
          <input placeholder={getSession() ? t('seu nome (ou deixe o da Pump)') : t('seu nome')} value={name} maxLength={24}
            onChange={(e) => setName(e.target.value)} required={!getSession()} />
          <button className="btn" disabled={busy}>{busy ? (checkin ? t('Conferindo local…') : t('Entrando…')) : checkin ? `📍 ${t('Check-in e entrar')}` : t('Entrar na fila')}</button>
        </form>
      )}

      {isAdmin && entries.length > 0 && (
        <button className="link small q-reset" onClick={() => window.confirm(t('Zerar a fila desta máquina?')) && act(() => resetQueue(machine.id))}>{t('Zerar fila')}</button>
      )}
    </section>
  );
}

export function Person({ entry, big }) {
  const initials = entry.display_name.slice(0, 2).toUpperCase();
  return (
    <span className={`q-person ${big ? 'big' : ''}`}>
      <span className="q-avatar">{entry.avatar_url ? <img src={entry.avatar_url} alt="" referrerPolicy="no-referrer" /> : initials}</span>
      <span className="q-name">{entry.display_name}</span>
      {entry.turns > 0 && <span className="q-turns">{t('{n}× jogou', { n: entry.turns })}</span>}
    </span>
  );
}

function Rules({ onClose }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="login-card" onClick={(e) => e.stopPropagation()}>
        <h3>{t('Regras da fila')}</h3>
        <ol className="steps small">
          <li>{t('Respeite a ordem da fila.')}</li>
          <li>{t('Para entrar na fila (e para voltar de "ausente") é preciso fazer check-in no local: o app confere a sua localização.')}</li>
          <li>{t('Indo para o local ou ao banheiro? Marque "Estou ausente".')}</li>
          <li>{t('Ausente por mais de 1 hora sai da fila automaticamente.')}</li>
          <li>{t('Fila sem movimento por 2 horas é zerada (só a daquela máquina).')}</li>
          <li>{t('Terminou seu crédito? Toque em "Passar a vez": você vai para o fim da fila.')}</li>
        </ol>
        <button className="btn wide" onClick={onClose}>{t('Fechar')}</button>
      </div>
    </div>
  );
}

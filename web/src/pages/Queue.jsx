import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { currentUserId, getSession } from '../lib/auth.js';
import {
  addGuest, backFromAway, joinQueue, leaveQueue, passTurn, queueEntries, recentEvents, resetQueue, setAway, subscribeQueue, toFront, venueData,
} from '../lib/queue.js';
import { locale, t, tErr } from '../lib/i18n.js';
import { rememberVenue } from '../lib/presence.js';
import { ArrowUpToLine, Bell, MapPin, SkipForward, UserPlus, X, Zap } from '../components/Icons.jsx';
import { isNative } from '../lib/native.js';
import { APP_SCHEME } from '../lib/config.js';
import { disablePush, enablePush, pushStatus, refreshPush } from '../lib/push.js';

const MY_ENTRIES = 'stepclub:queue-entries';
const myEntryIds = () => { try { return JSON.parse(localStorage.getItem(MY_ENTRIES) || '{}'); } catch { return {}; } };
const rememberEntry = (machine, id) => { try { localStorage.setItem(MY_ENTRIES, JSON.stringify({ ...myEntryIds(), [machine]: id })); } catch { /* ignore */ } };
// convidados que este aparelho colocou na fila (para quem não tem conta; com conta vale o guest_of)
const MY_GUESTS = 'stepclub:queue-guests';
const myGuestIds = () => { try { return JSON.parse(localStorage.getItem(MY_GUESTS) || '[]'); } catch { return []; } };
const rememberGuest = (id) => { try { localStorage.setItem(MY_GUESTS, JSON.stringify([...myGuestIds().slice(-20), id])); } catch { /* ignore */ } };

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
  const [params] = useSearchParams();
  const fromQr = params.get('checkin') === '1';

  if (error && !venue) return <div className="page"><p className="empty">{error}</p></div>;
  if (!venue) return <div className="page"><p className="empty">{t('Carregando a fila…')}</p></div>;

  return (
    <div className="page queue-page">
      <header className="q-head">
        <div>
          <Link to="/fila" className="q-city">‹ {venue.venue.city}</Link>
          <h1>{venue.venue.name}</h1>
          {venue.venue.active === false && <div className="banner">{t('Este fliperama saiu da lista do PIU Stats (fechou ou não tem mais Pump).')}</div>}
          {venue.venue.address && (
            <a className="q-addr" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${venue.venue.latitude && venue.venue.longitude ? `${venue.venue.latitude},${venue.venue.longitude}` : encodeURIComponent(venue.venue.address)}`}>
              <MapPin size={14} /> {venue.venue.address}
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
      <FastCheckin venue={venue} entries={entries} onChange={refresh} highlight={fromQr} slug={slug} />
      <PushToggle entries={entries} />
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

/**
 * Check-in rápido: quem está logado entra na fila com um toque, com o nome e a foto da Pump.
 * Quem chega pelo QR da TV sem conta vê o convite para o app ou para digitar o nome na máquina.
 */
function FastCheckin({ venue, entries, onChange, highlight, slug }) {
  const logged = !!getSession();
  const uid = currentUserId();
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');
  const inQueue = entries.some((e) => (uid && e.user_id === uid) || Object.values(myEntryIds()).includes(e.id));
  const android = /android/i.test(navigator.userAgent);
  if (inQueue) return null;
  if (!logged) {
    if (!highlight) return null;
    return (
      <section className="card q-fast guest">
        <h3 className="ic-row"><Zap size={18} /> {t('Entrar na fila')}</h3>
        <p className="small">{t('Sem conta: digite seu nome na máquina aqui embaixo e toque em Check-in.')}</p>
        {!isNative && android && (
          <a className="btn ghost wide" href={`intent://fila/${slug}?checkin=1#Intent;scheme=${APP_SCHEME};package=${APP_SCHEME};end`}>{t('Tenho o PIU Stats: abrir no app')}</a>
        )}
      </section>
    );
  }
  const go = async (m) => {
    setBusy(m.id); setErr('');
    try { const id = await joinQueue(m.id, null, true); rememberEntry(m.id, id); await onChange(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(0);
  };
  const count = (m) => entries.filter((e) => e.machine_id === m.id).length;
  return (
    <section className={`card q-fast ${highlight ? 'hl' : ''}`}>
      <h3 className="ic-row"><Zap size={18} /> {t('Check-in rápido')}</h3>
      <p className="muted small">{t('Entra na fila com o seu nome e foto da Pump. O app confere a sua localização.')}</p>
      <div className="q-fast-btns">
        {venue.machines.map((m) => (
          <button key={m.id} className="btn" disabled={!!busy} onClick={() => go(m)}>
            {busy === m.id ? t('Conferindo local…') : <>{venue.machines.length > 1 ? m.name : t('Entrar na fila')} <small>· {t('{n} na fila', { n: count(m) })}</small></>}
          </button>
        ))}
      </div>
      {err && <div className="form-err">{err}</div>}
    </section>
  );
}

/** Aviso no aparelho quando a pessoa (ou o convidado dela) é a próxima e quando chega a vez. Só liga se a pessoa quiser. */
function PushToggle({ entries }) {
  const uid = currentUserId();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { pushStatus().then((v) => { setSt(v); if (v === 'on') refreshPush(); }).catch(() => setSt('unsupported')); }, [uid]);
  const ids = Object.values(myEntryIds());
  const involved = entries.some((e) => (uid && (e.user_id === uid || e.guest_of === uid)) || ids.includes(e.id));
  if (!st || st === 'unsupported') return null;
  if (st === 'native' || st === 'ios-install' || st === 'denied') {
    if (!involved) return null;
    return (
      <section className="card q-push">
        <div className="q-push-row"><Bell size={18} /><div className="small muted">
          {st === 'native' ? t('Os avisos de "sua vez" ainda não chegam pelo app Android. Por enquanto, abra a fila pelo navegador (piustats.com.br) para ativar.')
            : st === 'ios-install' ? t('No iPhone, os avisos só funcionam com o PIU Stats na Tela de Início: toque em Compartilhar → Adicionar à Tela de Início e abra a fila por lá.')
              : t('As notificações estão bloqueadas para o PIU Stats. Libere nas configurações do navegador para receber o aviso da sua vez.')}
        </div></div>
      </section>
    );
  }
  const toggle = async () => {
    setBusy(true); setErr('');
    try {
      if (st === 'on') await disablePush(); else await enablePush();
      setSt(await pushStatus());
    } catch (e) { setErr(tErr(e.message)); setSt(await pushStatus().catch(() => st)); }
    setBusy(false);
  };
  return (
    <section className={`card q-push ${st === 'off' && involved ? 'hl' : ''}`}>
      <div className="q-push-row">
        <Bell size={18} />
        <div className="q-push-txt">
          <b>{st === 'on' ? t('Aviso da sua vez ligado') : t('Avisar quando for a minha vez')}</b>
          <div className="small muted">{t('Você recebe uma notificação quando for o próximo e quando chegar a sua vez (também vale para o seu convidado).')}</div>
        </div>
        <button className={`btn ${st === 'on' ? 'ghost' : ''}`} disabled={busy} onClick={toggle}>
          {busy ? '…' : st === 'on' ? t('Desligar') : t('Ativar')}
        </button>
      </div>
      {err && <div className="form-err">{err}</div>}
    </section>
  );
}

function MachineQueue({ machine, entries, isAdmin, checkin, onChange }) {
  const uid = currentUserId();
  const mine = entries.find((e) => (uid && e.user_id === uid) || myEntryIds()[machine.id] === e.id);
  const [name, setName] = useState(() => { try { return localStorage.getItem('stepclub:queue-name') || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const isMyGuest = (e) => e.is_guest && ((uid && e.guest_of === uid) || myGuestIds().includes(e.id));
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

  const addG = (e) => {
    e.preventDefault();
    act(async () => { const id = await addGuest(machine.id, guestName, checkin); rememberGuest(id); setGuestName(''); setGuestOpen(false); });
  };

  return (
    <section className="card q-machine">
      <div className="row-between">
        <h3>{machine.name}</h3>
        <span className="muted small">{waiting.length
          ? t('{n} na fila · espera ~{w} min', { n: waiting.length, w: Math.round((waiting.length * machine.avg_turn_sec) / 60) })
          : t('sem fila')} · {t('~{m} min por ficha', { m: Math.round(machine.avg_turn_sec / 60) })}</span>
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
            {isMyGuest(e) && !isAdmin && (
              <span className="q-admin">
                <button className="link small" disabled={busy} onClick={() => act(() => (e.status === 'away' ? backFromAway(e.id, checkin) : setAway(e.id, true)))}>
                  {e.status === 'away' ? t('Voltou') : t('Ausente')}
                </button>
                <button className="link" disabled={busy} onClick={() => window.confirm(t('Tirar {n} da fila?', { n: e.display_name })) && act(() => leaveQueue(e.id))} title={t('Tirar da fila')}><X size={16} /></button>
              </span>
            )}
            {isAdmin && (
              <span className="q-admin">
                <button className="link" onClick={() => act(() => toFront(e.id))} title={t('Mover para o topo')}><ArrowUpToLine size={16} /></button>
                <button className="link" onClick={() => act(() => leaveQueue(e.id))} title={t('Remover')}><X size={16} /></button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {err && <div className="form-err">{err}</div>}

      <button className="btn wide q-pass" disabled={busy || !playing} onClick={() => act(() => passTurn(machine.id))}>{t('Passar a vez')} <SkipForward size={16} /></button>

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
            <button className="btn ghost" disabled={busy} onClick={() => window.confirm(t('Sair da fila? Se voltar, entra no fim.')) && act(() => leaveQueue(mine.id))}>{t('Sair da fila')}</button>
          </div>
        </div>
      ) : (
        <form className="q-join" onSubmit={join}>
          <input placeholder={getSession() ? t('seu nome (ou deixe o da Pump)') : t('seu nome')} value={name} maxLength={24}
            onChange={(e) => setName(e.target.value)} required={!getSession()} />
          <button className="btn" disabled={busy}>{busy ? (checkin ? t('Conferindo local…') : t('Entrando…')) : checkin ? <><MapPin size={16} /> {t('Check-in e entrar')}</> : t('Entrar na fila')}</button>
        </form>
      )}

      {guestOpen ? (
        <form className="q-join q-guest" onSubmit={addG}>
          <input placeholder={t('nome do convidado')} value={guestName} maxLength={24} required autoFocus onChange={(e) => setGuestName(e.target.value)} />
          <button className="btn" disabled={busy}>{busy ? t('Conferindo local…') : checkin ? <><MapPin size={16} /> {t('Check-in e adicionar')}</> : t('Adicionar')}</button>
          <button type="button" className="btn ghost" onClick={() => setGuestOpen(false)}>{t('Cancelar')}</button>
          <p className="muted tiny">{t('Para quem está no fliperama sem celular. Você cuida da vaga dele: pode marcar ausente e tirar da fila. Até 2 convidados por pessoa.')}</p>
        </form>
      ) : (
        <button type="button" className="btn ghost wide q-add-guest" disabled={busy} onClick={() => setGuestOpen(true)}><UserPlus size={16} /> {t('Adicionar convidado na fila')}</button>
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
      <span className="q-name">{entry.display_name}{entry.is_guest && <small className="q-guest-of">{entry.guest_label ? t('convidado de {n}', { n: entry.guest_label }) : t('convidado')}</small>}</span>
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

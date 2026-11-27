// Notificações em pop-up: quando chega notificação nova (recorde ou passe de amigo, PUMBILITY subindo, live na Twitch,
// música nova, pedidos...), um cartão desce no topo da tela e some sozinho. Tocar abre o que a notificação aponta.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { usePrefs } from '../lib/prefs.js';
import { isOn } from '../lib/plans.js';
import { describe, linkFor, twitchUrl } from '../lib/notify.js';
import { t, tn } from '../lib/i18n.js';
import { Bell, X } from './Icons.jsx';

const SHOW_MS = 7000;
const LEAVE_MS = 350;
const MAX = 3;
const KEY = 'pumpstat:notif-popped-at';
// estes já têm aviso próprio na tela (convites e mensagens pela presença; contas novas no aviso da equipe)
const SKIP = new Set(['invite', 'message', 'admin_new_user']);

const poppedAt = () => { try { return Number(localStorage.getItem(KEY)) || null; } catch { return null; } };
const setPopped = (v) => { try { localStorage.setItem(KEY, String(v)); } catch { /* ignora */ } };

export default function NotifToast() {
  const { notifications: nt, plan } = useData();
  const [prefs] = usePrefs();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [cards, setCards] = useState([]); // { key, n, more, leaving }
  const shown = useRef(new Set());
  // na própria tela de notificações não precisa subir nada
  const on = isOn(plan, 'notif_popup') && prefs.notifPopup !== false && !plan?.view_as && pathname !== '/notificacoes';

  useEffect(() => {
    if (!nt?.loaded) return;
    const items = (nt.items || []).filter((n) => !SKIP.has(n.kind));
    const newest = Math.max(0, ...items.map((n) => Date.parse(n.at) || 0));
    const since = poppedAt();
    // primeira vez neste aparelho: só marca onde parou, sem despejar o histórico na tela
    if (since == null) { setPopped(newest || Date.now()); return; }
    const fresh = items.filter((n) => n.unread && Date.parse(n.at) > since && !shown.current.has(n.key)
      && !(n.kind === 'friend_live' && n.live_now === false));
    if (newest > since) setPopped(newest);
    if (!on || !fresh.length) return;
    fresh.forEach((n) => shown.current.add(n.key));
    const top = fresh.slice(0, MAX);
    const extra = fresh.length - top.length;
    setCards((cs) => [...cs, ...top.map((n, i) => ({ key: n.key, n, more: i === top.length - 1 ? extra : 0, leaving: false }))].slice(-MAX));
  }, [nt?.items, nt?.loaded, on]);

  useEffect(() => {
    if (!cards.length) return undefined;
    const timers = cards.filter((c) => !c.leaving).map((c) => setTimeout(() => close(c.key), c.n.kind === 'friend_live' ? SHOW_MS * 2 : SHOW_MS));
    return () => timers.forEach(clearTimeout);
  }, [cards]);

  function close(key) {
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, leaving: true } : c)));
    setTimeout(() => setCards((cs) => cs.filter((c) => c.key !== key)), LEAVE_MS);
  }
  const open = (c) => {
    close(c.key);
    if (c.n.kind === 'friend_live' && c.n.login) window.open(twitchUrl(c.n.login), '_blank', 'noopener');
    else nav(c.more ? '/notificacoes' : linkFor(c.n));
  };

  if (!cards.length) return null;
  return (
    <div className="nt-stack" aria-live="polite">
      {cards.map((c) => {
        const { n } = c;
        const live = n.kind === 'friend_live';
        return (
          <div key={c.key} className={`nt-toast ${live ? 'live' : ''} ${c.leaving ? 'leaving' : ''}`} role="status" onClick={() => open(c)}>
            <span className="nt-pic">
              {n.jacket ? <img src={n.jacket} alt="" referrerPolicy="no-referrer" />
                : n.avatar ? <img src={n.avatar} alt="" referrerPolicy="no-referrer" />
                  : n.nickname ? n.nickname.slice(0, 2) : <Bell size={18} />}
              {live && <i className="nt-live">{t('AO VIVO')}</i>}
            </span>
            <div className="nt-text">
              <span>{describe(n)}</span>
              {live && <small className="nt-cta">{t('Assistir na Twitch')}</small>}
              {c.more > 0 && <small className="muted">{tn(c.more, '+{n} notificação nova', '+{n} notificações novas')}</small>}
            </div>
            <button type="button" className="nt-x" aria-label={t('Fechar')} onClick={(e) => { e.stopPropagation(); close(c.key); }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

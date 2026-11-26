// Aviso "amigo ficou online", no estilo do MSN: um cartão sobe no canto de baixo e some sozinho.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { usePrefs } from '../lib/prefs.js';
import { isOn } from '../lib/plans.js';
import { t } from '../lib/i18n.js';
import { MapPin, X } from './Icons.jsx';

const SHOW_MS = 7000;
const LEAVE_MS = 450;
const COOLDOWN_MS = 15 * 60 * 1000; // o mesmo amigo não avisa de novo por 15 min
const KEY = 'stepclub:friend-online-at';

function lastAlert() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function remember(id) {
  const m = lastAlert();
  m[id] = Date.now();
  try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignora */ }
}

export default function FriendOnlineToast() {
  const { presence, plan } = useData();
  const enabled = isOn(plan, 'friend_online');
  const [prefs] = usePrefs();
  const navigate = useNavigate();
  const [cards, setCards] = useState([]); // { key, friend, leaving }
  const known = useRef(null); // amigos online no batimento anterior (null = ainda sem base)

  useEffect(() => {
    const list = presence.friends;
    if (!Array.isArray(list)) return;
    const now = new Set(list.map((f) => f.id));
    // primeiro batimento: só guarda quem já estava online, sem avisar
    if (known.current === null) { known.current = now; return; }
    const fresh = list.filter((f) => !known.current.has(f.id));
    known.current = now;
    if (!enabled || prefs.friendOnline === false || document.hidden || presence.status === 'busy') return;
    const seen = lastAlert();
    const show = fresh.filter((f) => !seen[f.id] || Date.now() - seen[f.id] > COOLDOWN_MS).slice(0, 3);
    if (!show.length) return;
    show.forEach((f) => remember(f.id));
    setCards((cs) => [...cs, ...show.map((f) => ({ key: `${f.id}-${Date.now()}`, friend: f, leaving: false }))].slice(-3));
  }, [presence.friends, prefs.friendOnline, enabled]);

  // cada cartão fica alguns segundos e desce
  useEffect(() => {
    if (!cards.length) return undefined;
    const timers = cards.filter((c) => !c.leaving).map((c) => setTimeout(() => close(c.key), SHOW_MS));
    return () => timers.forEach(clearTimeout);
  }, [cards]);

  function close(key) {
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, leaving: true } : c)));
    setTimeout(() => setCards((cs) => cs.filter((c) => c.key !== key)), LEAVE_MS);
  }

  if (!cards.length) return null;
  return (
    <div className="fo-stack" aria-live="polite">
      {cards.map(({ key, friend: f, leaving }) => (
        <div key={key} className={`fo-toast ${leaving ? 'leaving' : ''}`} role="status"
          onClick={() => { close(key); navigate(`/jogador/${f.id}`); }}>
          <div className="fo-bar"><span className="fo-brand">PIU Stats</span>
            <button className="fo-x" aria-label={t('Fechar')} onClick={(e) => { e.stopPropagation(); close(key); }}><X size={14} /></button>
          </div>
          <div className="fo-body">
            <span className="fo-avatar">
              {f.avatar ? <img src={f.avatar} alt="" referrerPolicy="no-referrer" /> : (f.nickname || '?').slice(0, 2)}
              <i className="fo-dot" />
            </span>
            <div className="fo-text">
              <b>{f.nickname || f.title || t('Um amigo')}</b>
              <span>{t('acabou de entrar')}</span>
              {f.venue && <small className="ic-row"><MapPin size={12} /> {f.venue}</small>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

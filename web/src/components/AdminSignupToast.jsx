// Alerta para a equipe: quando chega a notificação de conta nova, um cartão sobe no canto da tela.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { canAdmin } from '../lib/admin.js';
import { t } from '../lib/i18n.js';
import { UserCheck, X } from './Icons.jsx';

const SHOW_MS = 9000;

export default function AdminSignupToast() {
  const { notifications: nt, plan } = useData();
  const nav = useNavigate();
  const known = useRef(null);
  const [cards, setCards] = useState([]);
  const on = canAdmin(plan, 'users');

  useEffect(() => {
    if (!on || !nt?.loaded) return;
    const list = (nt.items || []).filter((n) => n.kind === 'admin_new_user');
    // primeira carga: só guarda o que já existia, sem alertar
    if (known.current === null) { known.current = new Set(list.map((n) => n.key)); return; }
    const fresh = list.filter((n) => n.unread && !known.current.has(n.key));
    list.forEach((n) => known.current.add(n.key));
    if (!fresh.length) return;
    setCards((cs) => [...cs, ...fresh.slice(0, 3).map((n) => ({ key: n.key, email: n.email, provider: n.provider }))].slice(-3));
  }, [nt?.items, nt?.loaded, on]);

  useEffect(() => {
    if (!cards.length) return undefined;
    const timers = cards.map((c) => setTimeout(() => setCards((cs) => cs.filter((x) => x.key !== c.key)), SHOW_MS));
    return () => timers.forEach(clearTimeout);
  }, [cards]);

  if (!cards.length) return null;
  return (
    <div className="fo-stack admin-signup" aria-live="polite">
      {cards.map((c) => (
        <div key={c.key} className="fo-toast" role="status" onClick={() => { setCards((cs) => cs.filter((x) => x.key !== c.key)); nav('/admin?tab=users'); }}>
          <div className="fo-bar"><span className="fo-brand">{t('Equipe PIU Stats')}</span>
            <button className="fo-x" aria-label={t('Fechar')} onClick={(e) => { e.stopPropagation(); setCards((cs) => cs.filter((x) => x.key !== c.key)); }}><X size={14} /></button>
          </div>
          <div className="fo-body">
            <span className="fo-avatar"><UserCheck size={18} /></span>
            <div className="fo-text">
              <b>{t('Novo usuário')}</b>
              <span>{c.email}</span>
              {c.provider && c.provider !== 'email' && <small>{c.provider === 'google' ? 'Google' : c.provider}</small>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

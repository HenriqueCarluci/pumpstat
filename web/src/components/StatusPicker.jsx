// Status com o app aberto (estilo MSN): Online, Ausente, Ocupado ou Aparecer offline.
import { useEffect, useRef, useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { isOn } from '../lib/plans.js';
import { t, tErr } from '../lib/i18n.js';
import { Check, ChevronDown } from './Icons.jsx';

export const STATUSES = [
  { id: 'online', label: 'Online', hint: 'Todo mundo vê você online' },
  { id: 'away', label: 'Ausente', hint: 'Aparece online, mas avisa que você não está olhando' },
  { id: 'busy', label: 'Ocupado', hint: 'Não recebe convites para jogar nem avisos na tela' },
  { id: 'invisible', label: 'Aparecer offline', hint: 'Ninguém vê você online e você não recebe convites' },
];

export function StatusDot({ status, className = '' }) {
  return <i className={`st-dot st-${status || 'offline'} ${className}`} aria-hidden />;
}

export default function StatusPicker() {
  const { presence, plan, session } = useData();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [local, setLocal] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => { setLocal(null); }, [presence.status]);
  if (!session || !isOn(plan, 'online')) return null;
  const cur = local || presence.status || (presence.mode === 'off' ? 'invisible' : 'online');
  const choose = async (s) => {
    setErr(''); setLocal(s); setOpen(false);
    try { await rpc('set_presence_status', { p_status: s }); presence.refresh(); } catch (e) { setLocal(null); setErr(tErr(e.message)); setOpen(true); }
  };
  const info = STATUSES.find((s) => s.id === cur) || STATUSES[0];
  return (
    <div className="status-picker" ref={ref}>
      <button className="status-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={t(info.label)} aria-label={t('Seu status: {s}', { s: t(info.label) })}>
        <StatusDot status={cur} />
        <ChevronDown size={12} className="status-chev" />
      </button>
      {open && (
        <div className="status-menu" role="menu">
          <div className="status-menu-h">{t('Seu status')}</div>
          {STATUSES.map((s) => (
            <button key={s.id} role="menuitemradio" aria-checked={cur === s.id} className={cur === s.id ? 'on' : ''} onClick={() => choose(s.id)}>
              <StatusDot status={s.id} />
              <span><b>{t(s.label)}</b><small>{t(s.hint)}</small></span>
              {cur === s.id && <Check size={14} />}
            </button>
          ))}
          {err && <div className="form-err small">{err}</div>}
        </div>
      )}
    </div>
  );
}

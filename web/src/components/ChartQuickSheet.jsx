import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { setTraining, useTraining } from '../lib/training.js';
import { fmtScore } from '../lib/piu.js';
import { t, tErr } from '../lib/i18n.js';
import { Ball, Grade, Jacket } from './ui.jsx';
import { BookmarkCheck, BookmarkPlus, Dumbbell, ExternalLink, X } from './Icons.jsx';

const HOLD_MS = 480;

/**
 * Segurar para abrir o menu rápido (toque longo no celular, botão direito no computador).
 * Devolve as props para o elemento e "pressed" para o efeito visual. Rolagem cancela.
 */
export function useLongPress(onLong) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const [pressed, setPressed] = useState(null);
  const clear = () => { clearTimeout(timer.current); timer.current = null; setPressed(null); };
  const bind = (key, payload) => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false; start.current = { x: e.clientX, y: e.clientY };
      setPressed(key);
      timer.current = setTimeout(() => { fired.current = true; setPressed(null); navigator.vibrate?.(15); onLong(payload); }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (!timer.current || !start.current) return;
      if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear,
    // Android dispara "contextmenu" no toque longo; no computador é o botão direito
    onContextMenu: (e) => { e.preventDefault(); clear(); if (!fired.current) { fired.current = true; onLong(payload); } },
    // depois do toque longo, o "click" que vem em seguida não navega
    onClickCapture: (e) => { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; } },
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return { bind, pressed };
}

/** Menu rápido de um chart: adicionar/tirar do Meu treino e abrir a música. */
export function ChartQuickSheet({ chart: c, onClose }) {
  const { plan } = useData();
  const list = useTraining();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!c) return undefined;
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [c, onClose]);
  if (!c) return null;
  const trainingOn = isOn(plan, 'training');
  const on = !!list?.has(c.id);
  const flip = async () => {
    setBusy(true); setMsg('');
    try { await setTraining(c.id, !on); setMsg(on ? t('Tirado do Meu treino.') : t('Adicionado ao Meu treino!')); setTimeout(onClose, 700); }
    catch (e) { setMsg(tErr(e.message)); } finally { setBusy(false); }
  };
  return (
    <div className="qs-backdrop" onClick={onClose} role="presentation">
      <div className="qs-sheet" role="dialog" aria-modal="true" aria-label={c.song.title} onClick={(e) => e.stopPropagation()}>
        <div className="qs-grip" aria-hidden="true" />
        <div className="qs-head">
          <Jacket song={c.song} width={56} />
          <div className="qs-info">
            <b>{c.song.title}</b>
            <div className="qs-sub"><Ball chart={c} size="sm" />{c.score != null && <><Grade grade={c.grade} broken={c.broken} size="sm" /><span className="small">{fmtScore(c.score)}</span></>}</div>
          </div>
          <button type="button" className="btn ghost icon" onClick={onClose} aria-label={t('Fechar')}><X size={16} /></button>
        </div>
        {trainingOn && (
          <button type="button" className={`btn wide qs-main ${on ? 'ghost' : ''}`} disabled={busy || !list} onClick={flip}>
            {on ? <><BookmarkCheck size={17} /> {t('Tirar do Meu treino')}</> : <><BookmarkPlus size={17} /> {t('Adicionar ao Meu treino')}</>}
          </button>
        )}
        {msg && <p className="small center qs-msg">{msg}</p>}
        <div className="qs-row">
          <Link className="btn ghost" to={`/musica/${c.song.id}?c=${c.id}`} onClick={onClose}><ExternalLink size={15} /> {t('Abrir música')}</Link>
          {trainingOn && <Link className="btn ghost" to="/treino" onClick={onClose}><Dumbbell size={15} /> {t('Meu treino')}</Link>}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { setTraining, useTraining } from '../lib/training.js';
import { t, tErr } from '../lib/i18n.js';
import { BookmarkCheck, BookmarkPlus } from './Icons.jsx';

/** Botão "Treinar": põe ou tira o chart do Meu treino. */
export default function TrainingToggle({ chart, compact = false, action = false }) {
  const { plan } = useData();
  const list = useTraining();
  const [busy, setBusy] = useState(false);
  if (!isOn(plan, 'training')) return null;
  const on = !!list?.has(chart.id);
  const flip = async () => {
    setBusy(true);
    try { await setTraining(chart.id, !on); } catch (e) { window.alert(tErr(e.message)); } finally { setBusy(false); }
  };
  if (action) {
    return (
      <button type="button" className={`cc-act train ${on ? 'on' : ''}`} disabled={busy || !list} onClick={flip} aria-pressed={on}
        title={on ? t('Tirar do Meu treino') : t('Adicionar ao Meu treino')}>
        {on ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}<span>{on ? t('No treino') : t('Treinar')}</span>
      </button>
    );
  }
  return (
    <button type="button" className={`btn ghost train-toggle ${on ? 'on' : ''} ${compact ? 'compact' : ''}`} disabled={busy || !list} onClick={flip}
      title={on ? t('Tirar do Meu treino') : t('Adicionar ao Meu treino')} aria-pressed={on}>
      {on ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}{!compact && ` ${on ? t('No treino') : t('Treinar')}`}
    </button>
  );
}

/**
 * Botão pequeno para listas (ex.: plano de treino): adiciona ao Meu treino;
 * se o chart já está lá, só informa ("Já no Meu treino") para não duplicar.
 */
export function TrainingAddChip({ chart }) {
  const { plan } = useData();
  const list = useTraining();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!isOn(plan, 'training')) return null;
  if (list?.has(chart.id)) {
    return <span className="train-chip in" title={t('Este chart já está no Meu treino')}><BookmarkCheck size={14} /> {t('Já no Meu treino')}</span>;
  }
  const add = async () => {
    setBusy(true); setErr('');
    try { await setTraining(chart.id, true); } catch (e) { setErr(tErr(e.message)); } finally { setBusy(false); }
  };
  return (
    <button type="button" className="train-chip" disabled={busy || !list} onClick={add} title={err || t('Adicionar ao Meu treino')}
      aria-label={`${t('Adicionar ao Meu treino')}: ${chart.song.title}`}>
      <BookmarkPlus size={14} /> {err ? t('Tentar de novo') : t('Treinar')}
    </button>
  );
}

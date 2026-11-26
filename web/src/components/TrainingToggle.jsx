import { useState } from 'react';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { setTraining, useTraining } from '../lib/training.js';
import { t, tErr } from '../lib/i18n.js';
import { BookmarkCheck, BookmarkPlus } from './Icons.jsx';

/** Botão "Treinar": põe ou tira o chart do Meu treino. */
export default function TrainingToggle({ chart, compact = false }) {
  const { plan } = useData();
  const list = useTraining();
  const [busy, setBusy] = useState(false);
  if (!isOn(plan, 'training')) return null;
  const on = !!list?.has(chart.id);
  const flip = async () => {
    setBusy(true);
    try { await setTraining(chart.id, !on); } catch (e) { window.alert(tErr(e.message)); } finally { setBusy(false); }
  };
  return (
    <button type="button" className={`btn ghost train-toggle ${on ? 'on' : ''} ${compact ? 'compact' : ''}`} disabled={busy || !list} onClick={flip}
      title={on ? t('Tirar do Meu treino') : t('Adicionar ao Meu treino')} aria-pressed={on}>
      {on ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}{!compact && ` ${on ? t('No treino') : t('Treinar')}`}
    </button>
  );
}

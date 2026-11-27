// Página de Novidades: lançados (por data) e próximos lançamentos.
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { markNotesSeen, NoteItem, useReleaseNotes } from '../components/ReleaseNotes.jsx';
import { Chips } from './Songs.jsx';
import { t } from '../lib/i18n.js';

export default function ReleaseNotes() {
  const list = useReleaseNotes();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'proximos' ? 'soon' : 'released';
  useEffect(() => { if (list?.length) markNotesSeen(list); }, [list]);
  const shown = (list || []).filter((n) => n.status === tab);
  return (
    <div className="page release-notes">
      <h2>{t('Novidades')}</h2>
      <p className="muted small">{t('O que chegou no PIU Stats e o que está a caminho.')}</p>
      <Chips value={tab} onChange={(v) => setParams(v === 'soon' ? { aba: 'proximos' } : {}, { replace: true })}
        options={[['released', t('Lançados')], ['soon', t('Próximos')]]} />
      {!list && <p className="empty">{t('Carregando…')}</p>}
      {list && !shown.length && <p className="empty">{tab === 'soon' ? t('Nada anunciado por enquanto.') : t('Nenhuma novidade ainda.')}</p>}
      {tab === 'soon' && shown.length > 0 && <p className="muted small">{t('Planos podem mudar: a ordem e as datas não são promessa.')}</p>}
      <ul className="rn-list">{shown.map((n) => <NoteItem key={n.id} n={n} />)}</ul>
    </div>
  );
}

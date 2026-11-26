import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { ProposalCard } from '../components/TierVote.jsx';
import { Vote } from '../components/Icons.jsx';

/** Votações de tier abertas e as encerradas na última semana. */
export default function Votes() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const load = () => rpc('tier_proposals_list', { p_charts: null }).then(setList).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);
  const open = (list || []).filter((p) => p.status === 'open');
  const closed = (list || []).filter((p) => p.status !== 'open');
  return (
    <div className="page votes-page">
      <h2 className="ic-row"><Vote size={20} /> {t('Votações de tier')}</h2>
      <p className="muted small">{t('Quem passou o chart pode propor mudar o tier do clube. Se a maioria de quem passou concordar até o fim do prazo, o tier muda.')}</p>
      {err && <div className="form-err">{err}</div>}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}
      {list && !open.length && <p className="empty">{t('Nenhuma votação aberta agora. Abra uma pela página da música, em "Avaliar".')}</p>}
      {open.map((p) => <ProposalCard key={p.id} p={p} onChange={load} showChart />)}
      {closed.length > 0 && <h3>{t('Encerradas nos últimos 7 dias')}</h3>}
      {closed.map((p) => <ProposalCard key={p.id} p={p} showChart />)}
    </div>
  );
}

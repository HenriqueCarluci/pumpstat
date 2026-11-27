import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { TITLE_COLORS, VERSIONS } from '../lib/piu.js';
import { Chips } from './Songs.jsx';
import { fmtNum, t, tErr } from '../lib/i18n.js';
import { Check } from '../components/Icons.jsx';

/** Títulos do jogador (os que tem e os que faltam, com o progresso), como na página "Title" do piugame. */
export default function Titles() {
  const { version } = useData();
  const { userId } = useParams();
  const [titles, setTitles] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    setTitles(null);
    rpc('my_titles', { p_version: version, p_user: userId || null })
      .then((r) => setTitles((r || []).map(([name, owned, color, condition, cur, target]) => ({ name, owned, color, condition, cur: cur == null ? null : +cur, target: target == null ? null : +target }))))
      .catch((e) => setErr(tErr(e.message)));
  }, [version, userId]);

  const list = useMemo(() => (titles || []).filter((x) =>
    (filter === 'all' || (filter === 'owned' ? x.owned : !x.owned)) &&
    (!q || x.name.toLowerCase().includes(q.toLowerCase()) || (x.condition || '').toLowerCase().includes(q.toLowerCase()))), [titles, filter, q]);

  if (err) return <div className="page"><p className="empty">{err}</p></div>;
  if (!titles) return <div className="page"><p className="empty">{t('Carregando títulos…')}</p></div>;
  if (!titles.length) {
    return <div className="page"><p className="empty">{t('Nenhum título da {v} ainda. Sincronize em Ajustes para trazer seus títulos.', { v: VERSIONS[version].name })}</p></div>;
  }

  const owned = titles.filter((x) => x.owned).length;
  const close = titles.filter((x) => !x.owned && x.target).sort((a, b) => b.cur / b.target - a.cur / a.target).slice(0, 3);

  return (
    <div className="page titles">
      <section className="card titles-head">
        <div className="big">{owned}<span className="muted">/{titles.length}</span></div>
        <div className="muted">{t('títulos da {v}', { v: VERSIONS[version].name })}</div>
        {close.length > 0 && (
          <div className="close-titles">
            <div className="small muted">{t('Mais perto de conseguir')}</div>
            {close.map((x) => <TitleRow key={x.name} t={x} />)}
          </div>
        )}
      </section>
      <div className="searchbar"><input type="search" placeholder={t('Buscar título ou condição')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Chips value={filter} onChange={setFilter} options={[['all', t('Todos')], ['owned', t('Tenho')], ['missing', t('Faltam')]]} />
      <div className="title-list">{list.map((x) => <TitleRow key={x.name} t={x} />)}</div>
    </div>
  );
}

function TitleRow({ t: x }) {
  const pct = x.target ? Math.min(100, (x.cur / x.target) * 100) : null;
  return (
    <div className={`title-row ${x.owned ? 'owned' : 'missing'}`}>
      <div className="title-name" style={{ backgroundImage: TITLE_COLORS[x.color ?? 0] }}>{x.name}</div>
      {x.owned ? <span className="tag owned-tag ic-row"><Check size={12} /> {t('tenho')}</span> : x.condition && <div className="small muted">{x.condition}</div>}
      {!x.owned && pct != null && (
        <div className="title-prog">
          <div className="tier-bar"><i style={{ width: `${pct}%` }} /></div>
          <span className="small">{fmtNum(x.cur)} / {fmtNum(x.target)}</span>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { TITLE_COLORS, VERSIONS } from '../lib/piu.js';
import { Chips } from './Songs.jsx';

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
      .then((r) => setTitles(r.map(([name, owned, color, condition, cur, target]) => ({ name, owned, color, condition, cur: cur == null ? null : +cur, target: target == null ? null : +target }))))
      .catch((e) => setErr(e.message));
  }, [version, userId]);

  const list = useMemo(() => (titles || []).filter((t) =>
    (filter === 'all' || (filter === 'owned' ? t.owned : !t.owned)) &&
    (!q || t.name.toLowerCase().includes(q.toLowerCase()) || (t.condition || '').toLowerCase().includes(q.toLowerCase()))), [titles, filter, q]);

  if (err) return <div className="page"><p className="empty">{err}</p></div>;
  if (!titles) return <div className="page"><p className="empty">Carregando títulos…</p></div>;
  if (!titles.length) {
    return <div className="page"><p className="empty">Nenhum título da {VERSIONS[version].name} ainda. Sincronize em Ajustes para trazer seus títulos.</p></div>;
  }

  const owned = titles.filter((t) => t.owned).length;
  const close = titles.filter((t) => !t.owned && t.target).sort((a, b) => b.cur / b.target - a.cur / a.target).slice(0, 3);

  return (
    <div className="page titles">
      <section className="card titles-head">
        <div className="big">{owned}<span className="muted">/{titles.length}</span></div>
        <div className="muted">títulos da {VERSIONS[version].name}</div>
        {close.length > 0 && (
          <div className="close-titles">
            <div className="small muted">Mais perto de conseguir</div>
            {close.map((t) => <TitleRow key={t.name} t={t} />)}
          </div>
        )}
      </section>
      <div className="searchbar"><input type="search" placeholder="Buscar título ou condição" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Chips value={filter} onChange={setFilter} options={[['all', 'Todos'], ['owned', 'Tenho'], ['missing', 'Faltam']]} />
      <div className="title-list">{list.map((t) => <TitleRow key={t.name} t={t} />)}</div>
    </div>
  );
}

function TitleRow({ t }) {
  const pct = t.target ? Math.min(100, (t.cur / t.target) * 100) : null;
  return (
    <div className={`title-row ${t.owned ? 'owned' : 'missing'}`}>
      <div className="title-name" style={{ backgroundImage: TITLE_COLORS[t.color ?? 0] }}>{t.name}</div>
      {t.owned ? <span className="tag owned-tag">✓ tenho</span> : t.condition && <div className="small muted">{t.condition}</div>}
      {!t.owned && pct != null && (
        <div className="title-prog">
          <div className="tier-bar"><i style={{ width: `${pct}%` }} /></div>
          <span className="small">{t.cur.toLocaleString('pt-BR')} / {t.target.toLocaleString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { Ball, Grade, Jacket, Plate } from '../components/ui.jsx';
import { rpc } from '../lib/api.js';
import { fmtScore, pbTier, VERSIONS } from '../lib/piu.js';
import { Chips } from './Songs.jsx';

function Avatar({ p, size = 44 }) {
  return (
    <span className="q-avatar" style={{ width: size, height: size }}>
      {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : (p.nickname || '?').slice(0, 2)}
    </span>
  );
}

/** Amigos (notas visíveis só depois da aprovação), busca por nickname e solicitações. */
export default function Players() {
  const { version } = useData();
  const [tab, setTab] = useState('friends');
  const [list, setList] = useState(null);
  const [reqs, setReqs] = useState({ incoming: [], outgoing: [] });
  const [err, setErr] = useState('');
  const load = () => {
    rpc('players', { p_version: version }).then(setList).catch((e) => setErr(e.message));
    rpc('friend_requests').then(setReqs).catch(() => {});
  };
  useEffect(() => { setList(null); load(); }, [version]); // eslint-disable-line

  const respond = async (id, accept) => { await rpc('respond_friend_request', { p_user: id, p_accept: accept }); load(); };
  const cancel = async (id) => { await rpc('remove_friend', { p_user: id }); load(); };

  return (
    <div className="page">
      <Chips value={tab} onChange={setTab} options={[
        ['friends', 'Amigos'], ['search', 'Buscar'],
        ['requests', `Solicitações${reqs.incoming.length ? ` (${reqs.incoming.length})` : ''}`],
      ]} />
      {err && <div className="form-err">{err}</div>}

      {tab === 'friends' && (
        !list ? <p className="empty">Carregando…</p> : (
          <>
            {list.length <= 1 && <p className="muted small">Você ainda não tem amigos no StepClub. Busque pelo nickname da Pump e mande uma solicitação: as notas só aparecem depois que a pessoa aprovar.</p>}
            <div className="players">
              {list.map((p, i) => {
                const t = version === 'phoenix2' ? pbTier(p.pumbility) : null;
                return (
                  <Link key={p.id} to={p.me ? '/' : `/jogador/${p.id}`} className={`player ${p.me ? 'me' : ''}`}>
                    <span className="rank">{i + 1}</span>
                    <Avatar p={p} />
                    <span className="pinfo">
                      <span className="ptitle">{p.title}</span>
                      <b>{p.nickname || 'Jogador'}</b>{p.me && <span className="tag">você</span>}
                      <small className="muted">{p.bests} recordes</small>
                    </span>
                    <span className="ppb">
                      {t?.icon && <img src={t.icon} alt="" referrerPolicy="no-referrer" />}
                      <b>{p.pumbility != null ? Math.round(p.pumbility).toLocaleString('pt-BR') : '—'}</b>
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )
      )}

      {tab === 'search' && <SearchPlayers onChange={load} />}

      {tab === 'requests' && (
        <div className="players">
          <h3>Recebidas</h3>
          {!reqs.incoming.length && <p className="muted small">Nenhuma solicitação pendente.</p>}
          {reqs.incoming.map((p) => (
            <div key={p.id} className="player req">
              <Avatar p={p} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{p.nickname}</b><small className="muted">quer ver suas notas e mostrar as dele</small></span>
              <span className="req-actions">
                <button className="btn" onClick={() => respond(p.id, true)}>Aceitar</button>
                <button className="btn ghost" onClick={() => respond(p.id, false)}>Recusar</button>
              </span>
            </div>
          ))}
          <h3>Enviadas</h3>
          {!reqs.outgoing.length && <p className="muted small">Nenhuma solicitação aguardando resposta.</p>}
          {reqs.outgoing.map((p) => (
            <div key={p.id} className="player req">
              <Avatar p={p} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{p.nickname}</b><small className="muted">aguardando aprovação</small></span>
              <span className="req-actions"><button className="btn ghost" onClick={() => cancel(p.id)}>Cancelar</button></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchPlayers({ onChange }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const run = async (term) => {
    const my = ++seq.current;
    if (term.length < 2) { setRes(null); setBusy(false); return; }
    setBusy(true);
    let r = [];
    try { r = await rpc('search_players', { p_query: term }); } catch { /* sem resultado */ }
    if (my === seq.current) { setRes(r); setBusy(false); }
  };
  // busca enquanto digita (espera 250 ms entre teclas)
  useEffect(() => { const t = setTimeout(() => run(q.trim()), 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line
  const add = async (p) => { await rpc('send_friend_request', { p_user: p.id }); await run(q.trim()); onChange(); };
  const LABEL = { friends: 'Amigos ✓', pending_out: 'Solicitação enviada' };
  return (
    <div className="typeahead">
      <input autoFocus placeholder="Digite o nickname da Pump…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {busy && <span className="ta-spin muted small">buscando…</span>}
      {res && (
        <div className="ta-list">
          {!res.length && <p className="muted small ta-empty">Ninguém com “{q.trim()}”. A pessoa precisa ter conectado a conta da Pump no StepClub.</p>}
          {res.map((p) => (
            <div key={p.id} className="player req">
              <Avatar p={p} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{hl(p.nickname, q.trim())}</b></span>
              <span className="req-actions">
                {p.relation === 'none' || p.relation === 'pending_in'
                  ? <button className="btn" onClick={() => add(p)}>{p.relation === 'pending_in' ? 'Aceitar' : 'Adicionar'}</button>
                  : <span className="tag">{LABEL[p.relation]}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="muted small">A busca mostra só nick, título e avatar. As notas aparecem depois que a pessoa aprovar.</p>
    </div>
  );
}

function hl(name, term) {
  const i = (name || '').toLowerCase().indexOf(term.toLowerCase());
  if (i < 0 || !term) return name;
  return <>{name.slice(0, i)}<mark>{name.slice(i, i + term.length)}</mark>{name.slice(i + term.length)}</>;
}

/** Comparação chart a chart entre você e outro jogador. */
export function ComparePlayer() {
  const { id } = useParams();
  const { data, version } = useData();
  const [rows, setRows] = useState(null);
  const [other, setOther] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('both');
  const [mode, setMode] = useState('all');

  useEffect(() => {
    setRows(null);
    Promise.all([rpc('compare_player', { p_other: id, p_version: version }), rpc('players', { p_version: version })])
      .then(([r, ps]) => { setRows(r); setOther(ps.find((p) => p.id === id) || null); })
      .catch((e) => setErr(e.message));
  }, [id, version]);

  const items = useMemo(() => (rows || []).map(([chartId, ms, mg, mp, mb, os, og, op, ob]) => ({
    chart: data.byId.get(chartId), me: { score: ms, grade: mg, plate: mp, broken: mb }, them: { score: os, grade: og, plate: op, broken: ob },
  })).filter((x) => x.chart && (mode === 'all' || x.chart.mode === mode)), [rows, data, mode]);

  if (err) return <div className="page"><p className="empty">{err}</p><Link to="/jogadores" className="btn ghost">Ver amigos e solicitações</Link></div>;
  if (!rows) return <div className="page"><p className="empty">Carregando comparação…</p></div>;

  const both = items.filter((x) => x.me.score != null && x.them.score != null);
  const wins = both.filter((x) => x.me.score > x.them.score).length;
  const losses = both.filter((x) => x.me.score < x.them.score).length;
  const shown = (filter === 'both' ? both : filter === 'only-them' ? items.filter((x) => x.me.score == null) : items.filter((x) => x.them.score == null))
    .sort((a, b) => b.chart.level - a.chart.level || ((b.them.score ?? 0) - (b.me.score ?? 0)) - ((a.them.score ?? 0) - (a.me.score ?? 0)));

  return (
    <div className="page compare">
      <section className="card vs">
        <div className="vs-side"><b>Você</b><span className="big up">{wins}</span></div>
        <div className="vs-mid">vs<small>{both.length} charts em comum</small></div>
        <div className="vs-side">{other && <Avatar p={other} size={36} />}<b>{other?.nickname || 'Jogador'}</b><span className="big down">{losses}</span></div>
      </section>
      <Chips value={filter} onChange={setFilter} options={[['both', 'Em comum'], ['only-them', 'Só ele jogou'], ['only-me', 'Só você jogou']]} />
      <Chips value={mode} onChange={setMode} options={[['all', 'Todos'], ['S', 'Single'], ['D', 'Double']]} />
      <div className="cmp-list">
        {shown.slice(0, 300).map((x) => {
          const diff = x.me.score != null && x.them.score != null ? x.me.score - x.them.score : null;
          return (
            <Link key={x.chart.id} to={`/musica/${x.chart.song.id}`} className="cmp-row">
              <Jacket song={x.chart.song} width={64} />
              <Ball chart={x.chart} size="sm" />
              <span className="cmp-name">{x.chart.song.title}</span>
              <span className="cmp-side"><Grade grade={x.me.grade} broken={x.me.broken} size="xs" /><small>{fmtScore(x.me.score)}</small></span>
              <span className="cmp-side"><Grade grade={x.them.grade} broken={x.them.broken} size="xs" /><small>{fmtScore(x.them.score)}</small></span>
              <span className={`cmp-diff ${diff == null ? '' : diff >= 0 ? 'up' : 'down'}`}>{diff == null ? '' : `${diff >= 0 ? '+' : '−'}${fmtScore(Math.abs(diff))}`}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Ranking de um chart entre os jogadores do StepClub (usado na página da música). */
export function ChartRanking({ chartId }) {
  const [list, setList] = useState(null);
  useEffect(() => { rpc('chart_ranking', { p_chart_id: chartId }).then(setList).catch(() => setList([])); }, [chartId]);
  if (!list) return <p className="muted small">Carregando ranking…</p>;
  if (list.length <= 1) return <p className="muted small">{list.length ? 'Só você entre seus amigos registrou este chart.' : 'Nenhum amigo registrou este chart ainda.'} Adicione amigos em Jogadores.</p>;
  return (
    <div className="chart-rank">
      {list.map((r, i) => (
        <Link key={r.id} to={r.me ? '#' : `/jogador/${r.id}`} className={`cr-row ${r.me ? 'me' : ''}`}>
          <span className="rank">{i + 1}</span>
          <Avatar p={r} size={28} />
          <span className="cr-name">{r.nickname || 'Jogador'}</span>
          <Grade grade={r.grade} broken={r.broken} size="xs" />
          <Plate plate={r.plate} size="xs" />
          <b className="cr-score">{fmtScore(r.score)}</b>
        </Link>
      ))}
    </div>
  );
}

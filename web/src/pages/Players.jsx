import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { Ball, Grade, Jacket, Plate } from '../components/ui.jsx';
import { rpc } from '../lib/api.js';
import { fmtScore, pbTier, VERSIONS } from '../lib/piu.js';
import { Chips } from './Songs.jsx';
import { fmtNum, t, tErr, tn } from '../lib/i18n.js';
import MiniChat from '../components/MiniChat.jsx';
import ReportBlock from '../components/ReportBlock.jsx';
import { entitlements } from '../lib/plans.js';

function Avatar({ p, size = 44 }) {
  return (
    <span className="q-avatar" style={{ width: size, height: size }}>
      {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : (p.nickname || '?').slice(0, 2)}
    </span>
  );
}

/** Amigos (notas visíveis só depois da aprovação), busca por nickname e solicitações. */
export default function Players() {
  const { version, plan } = useData();
  const friendCap = entitlements(plan).limit('friends');
  const [tab, setTab] = useState('friends');
  const [list, setList] = useState(null);
  const [reqs, setReqs] = useState({ incoming: [], outgoing: [] });
  const [err, setErr] = useState('');
  const load = () => {
    rpc('players', { p_version: version }).then(setList).catch((e) => setErr(tErr(e.message)));
    rpc('friend_requests').then(setReqs).catch(() => {});
  };
  useEffect(() => { setList(null); load(); }, [version]); // eslint-disable-line

  const respond = async (id, accept) => { await rpc('respond_friend_request', { p_user: id, p_accept: accept }); load(); };
  const cancel = async (id) => { await rpc('remove_friend', { p_user: id }); load(); };

  return (
    <div className="page">
      <Chips value={tab} onChange={setTab} options={[
        ['friends', t('Amigos')], ['search', t('Buscar')],
        ['requests', `${t('Solicitações')}${reqs.incoming.length ? ` (${reqs.incoming.length})` : ''}`],
      ]} />
      {err && <div className="form-err">{err}</div>}
      {friendCap != null && <p className="muted small">{t('{n} de {max} amigos no seu plano', { n: plan?.friends ?? 0, max: friendCap })}</p>}

      {tab === 'friends' && (
        !list ? <p className="empty">{t('Carregando…')}</p> : (
          <>
            {list.length <= 1 && <p className="muted small">{t('Você ainda não tem amigos no StepClub. Busque pelo nickname da Pump e mande uma solicitação: as notas só aparecem depois que a pessoa aprovar.')}</p>}
            <div className="players">
              {list.map((p, i) => {
                const tier = version === 'phoenix2' ? pbTier(p.pumbility) : null;
                return (
                  <Link key={p.id} to={p.me ? '/' : `/jogador/${p.id}`} className={`player ${p.me ? 'me' : ''}`}>
                    <span className="rank">{i + 1}</span>
                    <Avatar p={p} />
                    <span className="pinfo">
                      <span className="ptitle">{p.title}</span>
                      <b>{p.nickname || t('Jogador')}</b>{p.me && <span className="tag">{t('você')}</span>}
                      <small className="muted">{t('{n} recordes', { n: p.bests })}</small>
                    </span>
                    <span className="ppb">
                      {tier?.icon && <img src={tier.icon} alt="" referrerPolicy="no-referrer" />}
                      <b>{p.pumbility != null ? fmtNum(Math.round(p.pumbility)) : '—'}</b>
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
          <h3>{t('Recebidas')}</h3>
          {!reqs.incoming.length && <p className="muted small">{t('Nenhuma solicitação pendente.')}</p>}
          {reqs.incoming.map((p) => (
            <div key={p.id} className="player req">
              <Avatar p={p} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{p.nickname}</b><small className="muted">{t('quer ver suas notas e mostrar as dele')}</small></span>
              <span className="req-actions">
                <button className="btn" onClick={() => respond(p.id, true)}>{t('Aceitar')}</button>
                <button className="btn ghost" onClick={() => respond(p.id, false)}>{t('Recusar')}</button>
              </span>
            </div>
          ))}
          <h3>{t('Enviadas')}</h3>
          {!reqs.outgoing.length && <p className="muted small">{t('Nenhuma solicitação aguardando resposta.')}</p>}
          {reqs.outgoing.map((p) => (
            <div key={p.id} className="player req">
              <Avatar p={p} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{p.nickname}</b><small className="muted">{t('aguardando aprovação')}</small></span>
              <span className="req-actions"><button className="btn ghost" onClick={() => cancel(p.id)}>{t('Cancelar')}</button></span>
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
  useEffect(() => { const h = setTimeout(() => run(q.trim()), 250); return () => clearTimeout(h); }, [q]); // eslint-disable-line
  const add = async (p) => { await rpc('send_friend_request', { p_user: p.id }); await run(q.trim()); onChange(); };
  const LABEL = { friends: t('Amigos'), pending_out: t('Solicitação enviada') };
  return (
    <div className="typeahead">
      <input autoFocus placeholder={t('Digite o nickname da Pump…')} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {busy && <span className="ta-spin muted small">{t('buscando…')}</span>}
      {res && (
        <div className="ta-list">
          {!res.length && <p className="muted small ta-empty">{t('Ninguém com “{q}”. A pessoa precisa ter conectado a conta da Pump no StepClub.', { q: q.trim() })}</p>}
          {res.map((p) => (
            <div key={p.id} className="player req">
              <Avatar p={p} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{hl(p.nickname, q.trim())}</b></span>
              <span className="req-actions">
                {p.relation === 'none' || p.relation === 'pending_in'
                  ? <button className="btn" onClick={() => add(p)}>{p.relation === 'pending_in' ? t('Aceitar') : t('Adicionar')}</button>
                  : <span className="tag">{LABEL[p.relation]}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="muted small">{t('A busca mostra só nick, título e avatar. As notas aparecem depois que a pessoa aprovar.')}</p>
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
      .catch((e) => setErr(tErr(e.message)));
  }, [id, version]);

  const items = useMemo(() => (rows || []).map(([chartId, ms, mg, mp, mb, os, og, op, ob]) => ({
    chart: data.byId.get(chartId), me: { score: ms, grade: mg, plate: mp, broken: mb }, them: { score: os, grade: og, plate: op, broken: ob },
  })).filter((x) => x.chart && (mode === 'all' || x.chart.mode === mode)), [rows, data, mode]);

  if (err) return <div className="page"><p className="empty">{err}</p><Link to="/jogadores" className="btn ghost">{t('Ver amigos e solicitações')}</Link></div>;
  if (!rows) return <div className="page"><p className="empty">{t('Carregando comparação…')}</p></div>;

  const both = items.filter((x) => x.me.score != null && x.them.score != null);
  const wins = both.filter((x) => x.me.score > x.them.score).length;
  const losses = both.filter((x) => x.me.score < x.them.score).length;
  const shown = (filter === 'both' ? both : filter === 'only-them' ? items.filter((x) => x.me.score == null) : items.filter((x) => x.them.score == null))
    .sort((a, b) => b.chart.level - a.chart.level || ((b.them.score ?? 0) - (b.me.score ?? 0)) - ((a.them.score ?? 0) - (a.me.score ?? 0)));

  return (
    <div className="page compare">
      <section className="card vs">
        <div className="vs-side"><b>{t('Você')}</b><span className="big up">{wins}</span></div>
        <div className="vs-mid">vs<small>{t('{n} charts em comum', { n: both.length })}</small></div>
        <div className="vs-side">{other && <Avatar p={other} size={36} />}<b>{other?.nickname || t('Jogador')}</b><span className="big down">{losses}</span></div>
      </section>
      <MiniChat user={id} name={other?.nickname} />
      <ReportBlock user={id} name={other?.nickname} context={{ where: 'perfil' }} onBlocked={() => window.history.back()} />
      <Chips value={filter} onChange={setFilter} options={[['both', t('Em comum')], ['only-them', t('Só ele jogou')], ['only-me', t('Só você jogou')]]} />
      <Chips value={mode} onChange={setMode} options={[['all', t('Todos')], ['S', 'Single'], ['D', 'Double']]} />
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
  if (!list) return <p className="muted small">{t('Carregando ranking…')}</p>;
  if (list.length <= 1) return <p className="muted small">{list.length ? t('Só você entre seus amigos registrou este chart.') : t('Nenhum amigo registrou este chart ainda.')} {t('Adicione amigos em Amigos.')}</p>;
  return (
    <div className="chart-rank">
      {list.map((r, i) => (
        <Link key={r.id} to={r.me ? '#' : `/jogador/${r.id}`} className={`cr-row ${r.me ? 'me' : ''}`}>
          <span className="rank">{i + 1}</span>
          <Avatar p={r} size={28} />
          <span className="cr-name">{r.nickname || t('Jogador')}</span>
          <Grade grade={r.grade} broken={r.broken} size="xs" />
          <Plate plate={r.plate} size="xs" />
          <b className="cr-score">{fmtScore(r.score)}</b>
        </Link>
      ))}
    </div>
  );
}

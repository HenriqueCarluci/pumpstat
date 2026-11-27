import { Flag, useCountries } from '../lib/country.jsx';
import { SocialLinks } from '../components/Socials.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { TeamTag, useTeams } from '../lib/teams.jsx';
import { useData } from '../App.jsx';
import { Ball, Grade, Jacket, Plate } from '../components/ui.jsx';
import { rpc } from '../lib/api.js';
import { fmtScore, pbTier, PLATE_ORDER, pumbility, VERSIONS } from '../lib/piu.js';
import { Award, MessageCircle, Swords, TrendingUp } from '../components/Icons.jsx';
import { Chips } from './Songs.jsx';
import { fmtNum, t, tErr, tn } from '../lib/i18n.js';
import MiniChat from '../components/MiniChat.jsx';
import ReportBlock from '../components/ReportBlock.jsx';
import { entitlements } from '../lib/plans.js';
import { chartTagLabel, tagColor } from '../lib/tags.js';

export function Avatar({ p, size = 44 }) {
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
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'friends');
  const [playing, setPlaying] = useState([]);
  const [list, setList] = useState(null);
  const [reqs, setReqs] = useState({ incoming: [], outgoing: [] });
  const teamOf = useTeams([...(list || []).map((p) => p.id), ...playing.map((q) => q.user)]);
  const ccOf = useCountries([...(list || []).map((p) => p.id), ...playing.map((q) => q.user)]);
  const [err, setErr] = useState('');
  const load = () => {
    rpc('players', { p_version: version }).then(setList).catch((e) => setErr(tErr(e.message)));
    rpc('friend_requests').then(setReqs).catch(() => {});
    rpc('friends_in_queue').then((r) => setPlaying(r || [])).catch(() => {});
  };
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) rpc('friends_in_queue').then((r) => setPlaying(r || [])).catch(() => {}); }, 30000);
    return () => clearInterval(id);
  }, []);
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
            {playing.length > 0 && (
              <section className="playing-now">
                <h3><span className="live-dot" /> {t('Jogando agora')}</h3>
                {playing.map((q) => (
                  <Link key={`${q.user}-${q.venue}-${q.machine}`} to={`/fila/${q.venue}`} className="pn-item">
                    <Avatar p={q} size={36} />
                    <span>
                      <Flag cc={ccOf(q.user)} /><b>{q.nickname || t('Jogador')}</b><TeamTag team={teamOf(q.user)} />
                      <small>{q.venue_name} · {q.machine}{q.city ? ` · ${q.city}` : ''}</small>
                    </span>
                    <span className="pn-pos">
                      {q.position === 1 ? t('jogando') : t('{p}º na fila', { p: q.position })}
                      <small>{q.status === 'away' ? t('volta já') : tn(q.total, '{n} na fila', '{n} na fila')}</small>
                    </span>
                  </Link>
                ))}
              </section>
            )}
            {list.length <= 1 && <p className="muted small">{t('Você ainda não tem amigos no PIU Stats. Busque pelo nickname da Pump e mande uma solicitação: as notas só aparecem depois que a pessoa aprovar.')}</p>}
            <div className="players">
              {list.map((p, i) => {
                const tier = version === 'phoenix2' ? pbTier(p.pumbility) : null;
                return (
                  <Link key={p.id} to={p.me ? '/' : `/jogador/${p.id}`} className={`player ${p.me ? 'me' : ''}`}>
                    <span className="rank">{i + 1}</span>
                    <Avatar p={p} />
                    <span className="pinfo">
                      <span className="ptitle">{p.title}</span>
                      <Flag cc={ccOf(p.id)} /><b>{p.nickname || t('Jogador')}</b><TeamTag team={teamOf(p.id)} />{p.me && <span className="tag">{t('você')}</span>}
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
          {!res.length && <p className="muted small ta-empty">{t('Ninguém com “{q}”. A pessoa precisa ter conectado a conta da Pump no PIU Stats.', { q: q.trim() })}</p>}
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

/** Perfil de um amigo: informações, estatísticas, as 50 músicas que formam o PUMBILITY e o botão para comparar. */
export function PlayerProfile() {
  const { id } = useParams();
  const { data, version, session } = useData();
  const myId = session?.user?.id;
  const [rows, setRows] = useState(null);
  const [other, setOther] = useState(null);
  // leva até o minichat no fim da página e já deixa o campo pronto para escrever
  const openChat = () => {
    const el = document.getElementById('chat');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.querySelector('input')?.focus({ preventScroll: true }), 450);
  };
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('all');
  const teamOf = useTeams([id]);
  const ccOf = useCountries([id]);

  const isMe = !!myId && id === myId;
  useEffect(() => {
    setRows(null); setErr('');
    if (isMe) { setRows([]); return; }
    Promise.all([rpc('compare_player', { p_other: id, p_version: version }), rpc('players', { p_version: version })])
      .then(([r, ps]) => { setRows(r || []); setOther(ps.find((p) => p.id === id) || null); })
      .catch((e) => setErr(tErr(e.message)));
  }, [id, version, isMe]);

  // os recordes dele, no mesmo formato dos charts do app (para reaproveitar o cálculo do PUMBILITY); no seu perfil, os seus
  const charts = useMemo(() => (isMe ? data.charts.filter((c) => c.score != null) : (rows || []).filter((r) => r[5] != null).map(([chartId, , , , , os, og, op, ob]) => {
    const c = data.byId.get(chartId);
    return c ? { ...c, score: os, grade: og, plate: op, broken: !!ob } : null;
  }).filter(Boolean)), [rows, data, isMe]);
  const who = isMe
    ? { nickname: data.profile?.nickname, title: data.profile?.title, avatar: data.profile?.avatar_url, pumbility: data.profile?.pumbility }
    : other;
  const pb = useMemo(() => pumbility(version, charts), [version, charts]);
  const vs = useMemo(() => {
    const both = (rows || []).filter((r) => r[1] != null && r[5] != null);
    return { both: both.length, wins: both.filter((r) => r[1] > r[5]).length, losses: both.filter((r) => r[1] < r[5]).length };
  }, [rows]);
  const stats = useMemo(() => ['S', 'D'].map((m) => {
    const cs = charts.filter((c) => c.mode === m);
    const clears = cs.filter((c) => !c.broken);
    const byLevel = new Map();
    for (const c of cs) {
      const s = byLevel.get(c.level) || { level: c.level, clear: 0, broken: 0 };
      if (c.broken) s.broken++; else s.clear++;
      byLevel.set(c.level, s);
    }
    return { mode: m, total: cs.length, clears: clears.length, max: clears.reduce((a, c) => Math.max(a, c.level), 0),
      levels: [...byLevel.values()].filter((l) => l.level >= 10).sort((a, b) => b.level - a.level) };
  }), [charts]);
  const grades = useMemo(() => {
    const g = { SSS: 0, SS: 0, S: 0, AAA: 0 };
    for (const c of charts) {
      if (c.broken || !c.grade) continue;
      const k = c.grade.replace('+', '');
      if (k in g) g[k]++;
    }
    return g;
  }, [charts]);
  const plates = useMemo(() => {
    const p = {};
    for (const c of charts) if (c.plate && !c.broken) p[c.plate] = (p[c.plate] || 0) + 1;
    return PLATE_ORDER.filter((k) => p[k]).map((k) => [k, p[k]]);
  }, [charts]);

  if (err) return <div className="page"><p className="empty">{err}</p><Link to="/jogadores" className="btn ghost">{t('Ver amigos e solicitações')}</Link></div>;
  if (!rows) return <div className="page"><p className="empty">{t('Carregando perfil…')}</p></div>;

  const total = who?.pumbility != null ? Number(who.pumbility) : pb.total;
  const tier = version === 'phoenix2' ? pbTier(total) : null;
  const top = pb.top.filter((r) => mode === 'all' || r.chart.mode === mode);
  const maxLv = Math.max(1, ...stats.flatMap((s) => s.levels.map((l) => l.clear + l.broken)));

  return (
    <div className="page player-page">
      <section className="card pp-head">
        <Avatar p={who || {}} size={72} />
        <div className="pp-id">
          {who?.title && <span className="ptitle">{who.title}</span>}
          <h2><Flag cc={ccOf(id)} />{who?.nickname || t('Jogador')}</h2>
          <TeamTag team={teamOf(id)} />
        </div>
        <div className="pp-pb">
          {tier?.icon && <img src={tier.icon} alt="" referrerPolicy="no-referrer" />}
          <b>{fmtNum(Math.round(total))}</b>
          <small className="muted">PUMBILITY{tier?.name && tier.lv ? ` · ${tier.name} ${tier.lv}` : ''}</small>
        </div>
      </section>

      {isMe ? (
        <div className="pp-actions me">
          <Link to={`/titulos/${id}`} className="btn ghost"><Award size={16} /> {t('Títulos')}</Link>
          <Link to="/progresso" className="btn ghost"><TrendingUp size={16} /> {t('Seu progresso')}</Link>
        </div>
      ) : (
        <div className="pp-actions">
          <Link to={`/jogador/${id}/vs`} className="btn"><Swords size={16} /> {t('Comparar comigo')}</Link>
          <button type="button" className="btn ghost" onClick={openChat}><MessageCircle size={16} /> {t('Chat')}</button>
          <Link to={`/titulos/${id}`} className="btn ghost"><Award size={16} /> {t('Títulos')}</Link>
        </div>
      )}

      <section className={`pp-kpis ${isMe ? 'me' : ''}`}>
        <div className="card pp-kpi"><small className="muted">{t('Recordes')}</small><b>{fmtNum(charts.length)}</b></div>
        {stats.map((s) => (
          <div key={s.mode} className="card pp-kpi">
            <small className="muted">{s.mode === 'S' ? t('Maior Single') : t('Maior Double')}</small>
            <b className={s.mode === 'S' ? 'ball-s-txt' : 'ball-d-txt'}>{s.max ? `${s.mode}${s.max}` : '—'}</b>
            <small className="muted">{tn(s.clears, '{n} passe', '{n} passes')}</small>
          </div>
        ))}
        {!isMe && <div className="card pp-kpi">
          <small className="muted">{t('Você × {n}', { n: other?.nickname || t('Jogador') })}</small>
          <b><span className="up">{vs.wins}</span> × <span className="down">{vs.losses}</span></b>
          <small className="muted">{t('{n} charts em comum', { n: vs.both })}</small>
        </div>}
      </section>

      <PlayStyle charts={charts} stats={stats} name={other?.nickname || t('Jogador')} me={isMe} />

      <section className="card">
        <h3>{t('Notas e placas')}</h3>
        <div className="pp-grades">
          {Object.entries(grades).map(([g, n]) => (
            <span key={g} className="pp-grade"><Grade grade={g === 'SSS' ? 'SSS+' : g === 'SS' ? 'SS+' : g === 'S' ? 'S+' : 'AAA+'} size="sm" /><b>{n}</b><small className="muted">{g} {t('ou melhor')}</small></span>
          ))}
        </div>
        {plates.length > 0 && (
          <div className="pp-plates">
            {plates.map(([k, n]) => <span key={k} className="pp-plate"><Plate plate={k} size="sm" /><b>{n}</b></span>)}
          </div>
        )}
      </section>

      <section className="card">
        <h3>{t('Passes por nível')}</h3>
        <div className="pp-levels">
          {stats.map((s) => (
            <div key={s.mode} className="pp-lv-col">
              <h4 className={s.mode === 'S' ? 'ball-s-txt' : 'ball-d-txt'}>{s.mode === 'S' ? 'Single' : 'Double'}</h4>
              {!s.levels.length && <p className="muted small">{t('Sem recordes do nível 10 para cima.')}</p>}
              {s.levels.slice(0, 14).map((l) => (
                <div key={l.level} className="pp-lv" title={`${l.clear} / ${l.clear + l.broken}`}>
                  <span className="pp-lv-n">{s.mode}{l.level}</span>
                  <span className="pp-lv-bar">
                    <i className={`ok ${s.mode}`} style={{ width: `${(l.clear / maxLv) * 100}%` }} />
                    <i className="bad" style={{ width: `${(l.broken / maxLv) * 100}%` }} />
                  </span>
                  <span className="pp-lv-c">{l.clear}{l.broken ? <small className="muted"> +{l.broken}</small> : null}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="muted small">{t('Barra cheia: passou. Parte vermelha: só tem recorde quebrado.')}</p>
      </section>

      <section className="card">
        <h3>{t('Top 50 do PUMBILITY')}</h3>
        <p className="muted small">{t('As 50 notas que somam o PUMBILITY dele, com os pontos que cada uma vale.')}</p>
        <Chips value={mode} onChange={setMode} options={[['all', t('Todos')], ['S', 'Single'], ['D', 'Double']]} />
        {!top.length && <p className="empty">{t('Sem notas que contam para o PUMBILITY nesta versão.')}</p>}
        <div className="pp-top">
          {top.map((r) => (
            <Link key={r.chart.id} to={`/musica/${r.chart.song.id}`} className="pp-top-row">
              <span className="rank">{pb.top.indexOf(r) + 1}</span>
              <Jacket song={r.chart.song} width={64} />
              <Ball chart={r.chart} size="sm" />
              <span className="pp-top-name">{r.chart.song.title}<small className="muted">{fmtScore(r.chart.score)}</small></span>
              <span className="pp-top-gp"><Grade grade={r.chart.grade} size="xs" /><Plate plate={r.chart.plate} size="xs" /></span>
              <b className="pp-top-pts">{fmtNum(Math.round(r.value))}</b>
            </Link>
          ))}
        </div>
      </section>

      <SocialLinks userId={id} />
      {!isMe && <MiniChat user={id} name={other?.nickname} />}
      {!isMe && <ReportBlock user={id} name={other?.nickname} context={{ where: 'perfil' }} onBlocked={() => window.history.back()} />}
    </div>
  );
}

/** Comparação chart a chart entre você e outro jogador. */
export function ComparePlayer() {
  const { id } = useParams();
  const { data, version, session } = useData();
  const myId = session?.user?.id;
  const me = { nickname: data.profile?.nickname, avatar: data.profile?.avatar_url, title: data.profile?.title };
  const [rows, setRows] = useState(null);
  const [other, setOther] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('both');
  const [mode, setMode] = useState('all');
  const teamOf = useTeams([id, myId]);
  const ccOf = useCountries([id, myId]);

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
        <div className="vs-side">
          <Avatar p={me} size={36} />
          <b className="vs-nick"><Flag cc={ccOf(myId)} />{me.nickname || t('Você')}</b>
          <TeamTag team={teamOf(myId)} />
          <small className="muted vs-you">{t('você')}</small>
          <span className="big up">{wins}</span>
        </div>
        <div className="vs-mid">vs<small>{t('{n} charts em comum', { n: both.length })}</small></div>
        <div className="vs-side">
          <Link to={`/jogador/${id}`}><Avatar p={other || {}} size={36} /></Link>
          <b className="vs-nick"><Flag cc={ccOf(id)} />{other?.nickname || t('Jogador')}</b>
          <TeamTag team={teamOf(id)} />
          <small className="muted vs-you">{t('amigo')}</small>
          <span className="big down">{losses}</span>
        </div>
      </section>
      <Link to={`/jogador/${id}`} className="link small">{t('Ver o perfil de {n}', { n: other?.nickname || t('Jogador') })}</Link>
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

/** Ranking de um chart entre os jogadores do PIU Stats (usado na página da música). */
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

/**
 * Estilo de jogo de outro jogador: dos charts que ele passou perto do topo dele (até 4 níveis abaixo do maior passe
 * em cada modo), em quantos cada tag do ArcadeStat é forte (peso 50%+). Mostra também onde ele mais quebra.
 */
function PlayStyle({ charts, stats, name, me = false }) {
  const style = useMemo(() => {
    const top = Object.fromEntries(stats.map((s) => [s.mode, s.max]));
    const near = charts.filter((c) => (c.mode === 'S' || c.mode === 'D') && top[c.mode] && c.level >= top[c.mode] - 4 && c.tagBars);
    const count = (list) => {
      const n = {};
      for (const c of list) for (const [x, v] of c.tagBars) if (v >= 50) n[x] = (n[x] || 0) + 1;
      return Object.entries(n).map(([x, k]) => [x, Math.round((k / list.length) * 100)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    };
    const pass = near.filter((c) => !c.broken), fail = near.filter((c) => c.broken);
    return { pass: pass.length >= 5 ? count(pass) : [], fail: fail.length >= 3 ? count(fail) : [], n: pass.length, nf: fail.length };
  }, [charts, stats]);
  if (!style.pass.length) return null;
  const Bars = ({ list }) => (
    <div className="cp-skill">
      {list.map(([x, v]) => (
        <div key={x} className="cp-skill-row"><span>{t(chartTagLabel(x))}</span><i><b style={{ width: `${v}%`, background: tagColor(x) }} /></i><em>{v}%</em></div>
      ))}
    </div>
  );
  return (
    <section className="card pp-style">
      <h3>{t('Estilo de jogo')}</h3>
      <p className="muted small">{me
        ? t('Nos {n} charts que você passou perto do seu nível máximo, quantos têm cada tag forte.', { n: style.n })
        : t('Nos {n} charts que {p} passou perto do nível máximo dele, quantos têm cada tag forte.', { n: style.n, p: name })}</p>
      <Bars list={style.pass} />
      {style.fail.length > 0 && (
        <>
          <h4>{t('Onde mais quebra')}</h4>
          <p className="muted small">{tn(style.nf, '{n} chart quebrado nessa faixa', '{n} charts quebrados nessa faixa')}</p>
          <Bars list={style.fail} />
        </>
      )}
    </section>
  );
}

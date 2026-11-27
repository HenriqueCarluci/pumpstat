import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { cachedVersion, fetchVersion, rpc } from '../lib/api.js';
import { chartLabel, fmtScore, pbTier } from '../lib/piu.js';
import { fmtNum, t, tErr, tn } from '../lib/i18n.js';
import { Ball, Grade, Jacket } from '../components/ui.jsx';
import { Donut, GroupedBars, SERIES } from '../components/MiniChart.jsx';
import { Avatar } from './Players.jsx';
import { Chips } from './Songs.jsx';
import { Swords } from '../components/Icons.jsx';
import { img } from '../lib/imgStore.js';

const cleared = (x) => x.score != null && !x.broken;
const VS = 'phoenix2';

/** Você x seu rival na Phoenix 2: PUMBILITY, maior nível, clears por nível, confronto direto e onde cada um está na frente. */
export default function Rival() {
  const { data: cur, version } = useData();
  const [p2, setP2] = useState(version === VS ? cur : cachedVersion(VS));
  const [players, setPlayers] = useState(null);
  const [rival, setRival] = useState(undefined);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('D');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (version === VS) setP2(cur);
    else fetchVersion(VS).then(setP2).catch((e) => { if (!p2) setErr(tErr(e.message)); });
  }, [version, cur]); // eslint-disable-line
  useEffect(() => {
    rpc('players', { p_version: VS }).then(setPlayers).catch((e) => setErr(tErr(e.message)));
    rpc('my_rival').then((r) => setRival(r || null)).catch(() => setRival(null));
  }, []);
  useEffect(() => {
    if (!rival) { setRows(null); return; }
    setRows(null);
    rpc('compare_player', { p_other: rival, p_version: VS }).then(setRows).catch((e) => setErr(tErr(e.message)));
  }, [rival]);

  const friends = (players || []).filter((p) => !p.me);
  const me = (players || []).find((p) => p.me);
  const them = (players || []).find((p) => p.id === rival);

  const choose = async (id) => {
    setErr('');
    try { await rpc('set_my_rival', { p_user: id }); setRival(id); setPicking(false); } catch (e) { setErr(tErr(e.message)); }
  };

  const a = useMemo(() => {
    if (!rows || !p2) return null;
    const items = rows.map(([id, ms, mg, mp, mb, os, og, op, ob]) => ({
      chart: p2.byId.get(id), me: { score: ms, grade: mg, plate: mp, broken: mb }, them: { score: os, grade: og, plate: op, broken: ob },
    })).filter((x) => x.chart && (x.chart.mode === 'S' || x.chart.mode === 'D'));
    let win = 0, loss = 0, tie = 0;
    const behind = [], ahead = [], onlyThem = [];
    for (const x of items) {
      const a1 = cleared(x.me), b1 = cleared(x.them);
      if (x.me.score != null && x.them.score != null) {
        if (a1 && !b1) win++;
        else if (!a1 && b1) loss++;
        else if (x.me.score > x.them.score) win++;
        else if (x.me.score < x.them.score) loss++;
        else tie++;
      }
      if (a1 && b1 && x.them.score > x.me.score) behind.push({ ...x, diff: x.them.score - x.me.score });
      if (a1 && b1 && x.me.score > x.them.score) ahead.push({ ...x, diff: x.me.score - x.them.score });
      if (b1 && !a1) onlyThem.push(x);
    }
    const maxLv = (who, m) => Math.max(0, ...items.filter((x) => x.chart.mode === m && cleared(x[who])).map((x) => x.chart.level));
    const myMax = { S: maxLv('me', 'S'), D: maxLv('me', 'D') };
    const lv = new Map();
    for (const x of items) {
      if (x.chart.mode !== mode || x.chart.level < 10) continue;
      const s = lv.get(x.chart.level) || [0, 0];
      if (cleared(x.me)) s[0]++;
      if (cleared(x.them)) s[1]++;
      lv.set(x.chart.level, s);
    }
    return {
      win, loss, tie, myMax, theirMax: { S: maxLv('them', 'S'), D: maxLv('them', 'D') },
      clears: [items.filter((x) => cleared(x.me)).length, items.filter((x) => cleared(x.them)).length],
      levels: [...lv.entries()].sort((x, y) => x[0] - y[0]),
      behind: behind.sort((x, y) => y.diff - x.diff).slice(0, 8),
      ahead: ahead.sort((x, y) => y.diff - x.diff).slice(0, 5),
      onlyThem: onlyThem.sort((x, y) => Math.abs(x.chart.level - myMax[x.chart.mode] - 1) - Math.abs(y.chart.level - myMax[y.chart.mode] - 1)).slice(0, 8),
    };
  }, [rows, p2, mode]);

  if (err && !players) return <div className="form-err">{err}</div>;
  if (!players || rival === undefined) return <p className="empty">{t('Carregando…')}</p>;
  if (!friends.length) return <p className="empty">{t('Adicione amigos em Amigos para escolher um rival.')} <Link to="/jogadores">{t('Amigos')}</Link></p>;

  if (!rival || picking) {
    return (
      <section className="card">
        <h3 className="ic-row"><Swords size={18} /> {t('Escolha seu rival')}</h3>
        <p className="muted small">{t('Um amigo para comparar tudo na Phoenix 2. Dá para trocar quando quiser.')}</p>
        <div className="players">
          {friends.map((p) => (
            <button key={p.id} className={`player rival-pick ${p.id === rival ? 'me' : ''}`} onClick={() => choose(p.id)}>
              <Avatar p={p} size={36} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{p.nickname || t('Jogador')}</b></span>
              <span className="ppb rv-pick-pb"><b>{p.pumbility != null ? fmtNum(Math.round(p.pumbility)) : '—'}</b><small>PUMBILITY</small></span>
            </button>
          ))}
        </div>
        {rival && <button className="link" onClick={() => setPicking(false)}>{t('Cancelar')}</button>}
        {err && <div className="form-err">{err}</div>}
      </section>
    );
  }

  const pb = [me?.pumbility, them?.pumbility];
  const tierA = pbTier(pb[0]), tierB = pbTier(pb[1]);
  const name = them?.nickname?.replace(/ #\d+$/, '') || t('Rival');
  return (
    <>
      <section className="card rival-head">
        <div className="rv-side">
          <Avatar p={me || {}} size={48} />
          <b>{t('Você')}</b>
          <span className="rv-pb">{tierA?.icon && <img src={img(tierA.icon)} alt="" referrerPolicy="no-referrer" />}{pb[0] != null ? fmtNum(Math.round(pb[0])) : '—'}</span>
        </div>
        <div className="rv-mid">
          <Swords size={22} />
          {pb[0] != null && pb[1] != null && <small className={pb[0] >= pb[1] ? 'up' : 'down'}>{pb[0] >= pb[1] ? '+' : '−'}{fmtNum(Math.round(Math.abs(pb[0] - pb[1])))}</small>}
        </div>
        <div className="rv-side">
          <Link to={`/jogador/${rival}`}><Avatar p={them || {}} size={48} /></Link>
          <b>{name}</b>
          <span className="rv-pb">{tierB?.icon && <img src={img(tierB.icon)} alt="" referrerPolicy="no-referrer" />}{pb[1] != null ? fmtNum(Math.round(pb[1])) : '—'}</span>
        </div>
        <button className="link small rv-change" onClick={() => setPicking(true)}>{t('Trocar rival')}</button>
      </section>
      {!a ? <p className="empty">{t('Carregando…')}</p> : (
        <>
          <section className="rival-stats">
            {[[t('Maior Single'), a.myMax.S, a.theirMax.S, 'S'], [t('Maior Double'), a.myMax.D, a.theirMax.D, 'D'], [t('Charts passados'), a.clears[0], a.clears[1]]].map(([l, x, y, m]) => (
              <div key={l} className="stat">
                <div className="l">{l}</div>
                <div className="rv-vs">
                  <span className={x >= y ? 'lead' : ''}>{m ? (x ? chartLabel({ mode: m, level: x }) : '—') : fmtNum(x)}</span>
                  <span className="muted">×</span>
                  <span className={y > x ? 'lead them' : ''}>{m ? (y ? chartLabel({ mode: m, level: y }) : '—') : fmtNum(y)}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="card">
            <h3>{t('Confronto direto')}</h3>
            <p className="muted small">{tn(a.win + a.loss + a.tie, 'No {n} chart que vocês dois jogaram, quem tem a nota maior (passar vale mais que quebrar).', 'Nos {n} charts que vocês dois jogaram, quem tem a nota maior (passar vale mais que quebrar).')}</p>
            <Donut label={t('Confronto direto')} center={[`${a.win}–${a.loss}`, t('vitórias–derrotas')]}
              slices={[{ key: 'w', name: t('Você na frente'), value: a.win, color: SERIES.a }, { key: 'l', name: t('{n} na frente', { n: name }), value: a.loss, color: SERIES.b },
                { key: 't', name: t('Empate'), value: a.tie, color: '#6b6f78' }]} />
          </section>

          <section className="card">
            <h3>{t('Charts passados por nível')}</h3>
            <Chips value={mode} onChange={setMode} options={[['S', 'Single'], ['D', 'Double']]} />
            {a.levels.length ? (
              <GroupedBars bars={a.levels.map(([L, v]) => ({ key: L, label: String(L), values: v }))}
                series={[{ name: t('Você'), color: SERIES.a }, { name, color: SERIES.b }]} label={t('Charts passados por nível')} />
            ) : <p className="muted small">{t('Nenhum dos dois passou charts neste modo ainda.')}</p>}
          </section>

          <RivalList title={t('Onde {n} está na frente', { n: name })} items={a.behind} diff="down" empty={t('Em nenhum chart que vocês dois passaram.')} />
          <RivalList title={t('Só {n} passou', { n: name })} items={a.onlyThem} hint={t('Os mais perto do seu nível primeiro: bons alvos para a semana.')} empty={t('Nada: tudo que {n} passou você também passou.', { n: name })} />
          <RivalList title={t('Onde você está na frente')} items={a.ahead} diff="up" empty={t('Ainda nenhum.')} />
        </>
      )}
    </>
  );
}

function RivalList({ title, items, diff, hint, empty }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {hint && <p className="muted small">{hint}</p>}
      {!items.length && <p className="muted small">{empty}</p>}
      <div className="rival-list">
        {items.map((x) => (
          <Link key={x.chart.id} to={`/chart/${x.chart.id}`} className="rival-item">
            <Jacket song={x.chart.song} width={44} />
            <Ball chart={x.chart} size="sm" />
            <span className="ttl">{x.chart.song.title}</span>
            <span className="rv-scores">
              <span><Grade grade={x.me.grade} broken={x.me.broken} size="xs" /> {x.me.score != null ? fmtScore(x.me.score) : '—'}</span>
              <span className="muted"><Grade grade={x.them.grade} broken={x.them.broken} size="xs" /> {fmtScore(x.them.score)}</span>
            </span>
            {diff && <small className={diff}>{diff === 'up' ? '+' : '−'}{fmtScore(x.diff)}</small>}
          </Link>
        ))}
      </div>
    </section>
  );
}

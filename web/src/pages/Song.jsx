import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { ChartRanking } from './Players.jsx';
import { Ball, fmtDate, Grade, Jacket, Plate } from '../components/ui.jsx';
import { chartHistory } from '../lib/api.js';
import { chartRating, chartTier, DIFF_PT, fmtScore, nextGrade, TIERS, VERSIONS } from '../lib/piu.js';
import { topStyles, useStyles, videoUrl } from '../lib/style.js';
import { rpc } from '../lib/api.js';
import StyleBars from '../components/StyleBars.jsx';
import ChartReviews, { REVIEW_TAGS } from '../components/ChartReviews.jsx';
import { t } from '../lib/i18n.js';
import { ChevronDown, ChevronUp, History, PencilLine, Play, Users } from '../components/Icons.jsx';
import { usePrefs } from '../lib/prefs.js';
import AdSlot from '../components/AdSlot.jsx';
import { entitlements } from '../lib/plans.js';
import { Crown } from '../components/Icons.jsx';

export default function Song() {
  const { id } = useParams();
  const { data, version, reload, plan } = useData();
  const song = data.songs.find((s) => String(s.id) === id);
  const styleOf = useStyles(song ? [song.id] : []);
  const friendsOf = useFriendScores(song?.id, version);
  const [params] = useSearchParams();
  const focus = Number(params.get('c')) || null;
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`chart-${focus}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus, song?.id]);
  if (!song) return <div className="page"><p className="empty">{t('Música não encontrada nesta versão.')}</p><Link to="/musicas">{t('Voltar')}</Link></div>;

  const other = version === 'phoenix2' ? VERSIONS.phoenix : VERSIONS.phoenix2;
  const hasLegacy = version === 'phoenix2' && song.charts.some((c) => c.otherScore != null);
  const groups = [['S', 'Single'], ['D', 'Double'], ['C', 'Co-op']]
    .map(([m, label]) => [label, song.charts.filter((c) => c.mode === m)])
    .filter(([, cs]) => cs.length);

  return (
    <div className="page">
      <section className="song-hero">
        <Jacket song={song} width={220} className="hero-jacket" />
        <div>
          <h1>{song.title}</h1>
          <div className="muted">{song.artist || t('Artista desconhecido')}</div>
          <div className="tags">
            {song.bpm && <span className="tag">{song.bpm} BPM</span>}
            {song.songType && <span className="tag">{song.songType}</span>}
          </div>
          <a className="btn yt" href={videoUrl('s', song.id, song.title)} target="_blank" rel="noreferrer"><Play size={16} fill="currentColor" /> {t('Ver no YouTube')}</a>
          {plan?.admin && <VideoAdmin vkey={`s:${song.id}`} />}
        </div>
      </section>

      {hasLegacy && <LegacyToggle />}

      {groups.map(([label, charts]) => (
        <section key={label}>
          <h3 className="group-h">{label}</h3>
          {charts.map((c) => <ChartCard key={c.id} chart={c} version={version} other={other} style={styleOf(c)} friends={friendsOf(c.id)} focus={focus === c.id} onReviewed={() => reload()} />)}
        </section>
      ))}
      <AdSlot place="song" />
    </div>
  );
}

const ytId = (s) => (String(s || '').trim().match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/) || String(s || '').trim().match(/^([\w-]{11})$/) || [])[1] || null;

/** Admin: corrige o vídeo do YouTube de um chart ou música (cola o link). */
function VideoAdmin({ vkey }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState('');
  const save = async (clear) => {
    const id = clear ? null : ytId(val);
    if (!clear && !id) { setMsg(t('Cole um link do YouTube.')); return; }
    try { await rpc('admin_set_video', { p_vkey: vkey, p_video: id }); setMsg(clear ? t('Vídeo removido; o app vai buscar de novo.') : t('Vídeo salvo.')); setVal(''); } catch (e) { setMsg(e.message); }
  };
  if (!open) return <button className="link small muted video-admin-open" onClick={() => setOpen(true)}>{t('Corrigir vídeo')}</button>;
  return (
    <div className="video-admin">
      <input placeholder="https://youtu.be/…" value={val} onChange={(e) => { setVal(e.target.value); setMsg(''); }} />
      <button className="btn" onClick={() => save(false)}>{t('Salvar')}</button>
      <button className="btn ghost" onClick={() => save(true)}>{t('Buscar de novo')}</button>
      {msg && <span className="small muted">{msg}</span>}
    </div>
  );
}

export function LegacyToggle() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <button className={`chip-toggle ${prefs.legacyP1 ? 'on' : ''}`} onClick={() => setPrefs({ legacyP1: !prefs.legacyP1 })}
      title={t('Mostrar os recordes da Phoenix nos charts que você ainda não jogou na Phoenix 2')}>
      <History size={14} /> {prefs.legacyP1 ? t('Esconder legado P1') : t('Mostrar legado P1')}
    </button>
  );
}

function ChartCard({ chart: c, version, other, style, friends, focus, onReviewed }) {
  const { plan } = useData();
  const [prefs] = usePrefs();
  const legacyMode = version === 'phoenix2';
  const showOther = c.otherScore != null && (!legacyMode || prefs.legacyP1);
  const ent = entitlements(plan);
  const months = ent.can('history_full') ? null : ent.limit('history_months');
  const histCut = months ? new Date(Date.now() - months * 30.4 * 86400000) : null;
  const [showStyle, setShowStyle] = useState(false);
  const [reviews, setReviews] = useState(false);
  const [hist, setHist] = useState(null);
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState(false);
  const rating = chartRating(version, c.mode, c.level, c.score, c.grade, c.plate, c.broken);
  const nxt = c.score != null && !c.broken ? nextGrade(version, c.score) : null;
  const tier = TIERS.find((x) => x.id === chartTier(c));
  const yt = videoUrl('c', c.id, c.song.title, `${c.mode}${c.level}`);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!hist) { try { setHist(await chartHistory(c.id)); } catch { setHist({ bests: [], plays: [] }); } }
  };

  return (
    <div id={`chart-${c.id}`} className={`chartcard ${c.score != null ? 'played' : ''} ${focus ? 'focus' : ''}`}>
      <div className="cc-top">
        <Ball chart={c} />
        <div className="cc-score">
          <div className="sc">{fmtScore(c.score)}</div>
          <div className="cc-badges">
            <Grade grade={c.grade} broken={c.broken} />
            <Plate plate={c.plate} />
            {c.broken && <span className="tag warn">stage break</span>}
          </div>
        </div>
        <div className="cc-side">
          {rating > 0 && <div className="rating" title={t('Valor estimado no PUMBILITY')}>{rating.toFixed(2)}</div>}
          {nxt && <div className="need">{t('+{n} p/ {g}', { n: fmtScore(nxt.need), g: nxt.grade })}</div>}
        </div>
      </div>

      <FriendScores list={friends} mine={c} />

      <div className="cc-meta">
        {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{t(tier.label)}{c.scoringLevel ? ` · ${c.scoringLevel.toFixed(1)}` : ''}</span>}
        {c.passDifficulty && c.passDifficulty !== 'Unrecorded' && <span className="tag">Clear: {t(DIFF_PT[c.passDifficulty] || c.passDifficulty)}</span>}
        {c.stepArtist && <span className="tag ic-row"><PencilLine size={12} /> {c.stepArtist}</span>}
        {c.notes ? <span className="tag">{t('{n} notas', { n: c.notes })}</span> : null}
        {c.skills.map((s) => <span key={s} className="tag skill">{s}</span>)}
        {c.community?.tags?.length > 0 && (
          <span className="tag community" title={t('Tags marcadas pela comunidade do StepClub')}>
            <Users size={12} /> {c.community.tags.map((x) => t(REVIEW_TAGS.find(([k]) => k === x)?.[1] || x)).join(' · ')}
          </span>
        )}
      </div>
      {style && (
        <button className="cc-style" onClick={() => setShowStyle((v) => !v)} title={t('Ver estilo do chart')}>
          {topStyles(style).map((k) => <span key={k.id} className="st-chip" style={{ '--c': k.color }}>{t(k.label)} {Math.round(k.v)}%</span>)}
          {style.nps != null && <span className="muted small">{t('{n} notas/s', { n: style.nps })}</span>}
          <span className="muted small">{showStyle ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>
      )}
      {style && showStyle && <StyleBars style={style} locked={!ent.can('style_full')} />}
      {!style && c.skills.length > 0 && <p className="muted tiny">{t('Música nova: a análise detalhada de estilo ainda não saiu; os padrões acima vêm do PIU Scores e já contam nos seus pontos fracos.')}</p>}

      {showOther && (
        <div className={`cc-other ${legacyMode ? 'legacy' : ''}`}>
          {legacyMode ? <span className="legacy-tag"><History size={12} /> {t('Legado Phoenix')}</span> : `${other.name}:`} <b>{fmtScore(c.otherScore)}</b> <Grade grade={c.otherGrade} size="sm" /> <Plate plate={c.otherPlate} />
          {c.score != null && <span className={c.score >= c.otherScore ? 'up' : 'down'}> {c.score >= c.otherScore ? '▲' : '▼'} {fmtScore(Math.abs(c.score - c.otherScore))}</span>}
        </div>
      )}

      <div className="cc-actions">
        {c.achievedAt && <span className="muted">{t('Recorde em {d}', { d: fmtDate(c.achievedAt) })}</span>}
        <span className="spacer" />
        <a href={yt} target="_blank" rel="noreferrer" className="link ic-row"><Play size={13} fill="currentColor" /> YouTube</a>
        <button className="link" onClick={() => setReviews((r) => !r)}>{reviews ? t('Fechar') : `${t('Avaliar')}${c.community?.votes ? ` (${c.community.votes})` : ''}`}</button>
        <button className="link" onClick={() => setRank((r) => !r)}>{rank ? t('Fechar') : t('Ranking')}</button>
        <button className="link" onClick={toggle}>{open ? t('Fechar') : t('Histórico')}</button>
      </div>
      {plan?.admin && <VideoAdmin vkey={`c:${c.id}`} />}

      {reviews && <div className="cc-hist"><ChartReviews chart={c} onSaved={onReviewed} /></div>}
      {rank && <div className="cc-hist"><ChartRanking chartId={c.id} /></div>}
      {open && (
        <div className="cc-hist">
          {!hist && <p className="muted">{t('Carregando…')}</p>}
          {hist && !hist.plays.length && !hist.bests.length && <p className="muted">{t('Sem histórico registrado ainda.')}</p>}
          {hist?.plays?.filter((p) => !histCut || new Date(p[0]) >= histCut).map((p, i) => (
            <div key={i} className="hrow">
              <span className="muted">{fmtDate(p[0])}</span>
              <span className="sc">{fmtScore(p[1])}</span>
              <Grade grade={p[2]} broken={p[9]} size="sm" />
              <Plate plate={p[3]} />
              <span className="judg">{p[4]}/{p[5]}/{p[6]}/{p[7]}/<b>{p[8]}</b></span>
            </div>
          ))}
          {histCut && hist?.plays?.some((p) => new Date(p[0]) < histCut) && (
            <div className="muted small ic-row"><Crown size={13} /> {t('Histórico completo no Plus (grátis: últimos {n} meses).', { n: months })}</div>
          )}
          {hist?.bests?.length > 0 && (
            <div className="muted small">{t('Evolução do recorde:')} {hist.bests.map((b) => fmtScore(b[1])).join(' → ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Notas dos amigos em cada chart da música (uma chamada só para a música inteira). */
function useFriendScores(songId, version) {
  const [map, setMap] = useState(new Map());
  useEffect(() => {
    if (!songId) return undefined;
    let alive = true;
    rpc('song_friend_scores', { p_song: songId, p_version: version }).then((rows) => {
      if (!alive) return;
      const m = new Map();
      for (const r of rows || []) { if (!m.has(r.chart)) m.set(r.chart, []); m.get(r.chart).push(r); }
      setMap(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, [songId, version]);
  return (chartId) => map.get(chartId) || null;
}

function FriendScores({ list, mine }) {
  const [all, setAll] = useState(false);
  if (!list?.length) return null;
  const shown = all ? list : list.slice(0, 3);
  const me = mine.score != null && !mine.broken ? mine.score : null;
  return (
    <div className="friend-scores">
      <div className="fs-head small muted">{t('Amigos')}</div>
      {shown.map((f) => {
        const diff = me != null && f.score != null && !f.broken ? me - f.score : null;
        return (
          <Link key={f.user} to={`/jogador/${f.user}`} className="fs-row">
            <span className="q-avatar" style={{ width: 24, height: 24 }}>{f.avatar ? <img src={f.avatar} alt="" referrerPolicy="no-referrer" /> : (f.nickname || '?').slice(0, 2)}</span>
            <span className="fs-name">{(f.nickname || t('Jogador')).replace(/ #\d+$/, '')}</span>
            <Grade grade={f.grade} broken={f.broken} size="xs" />
            <b className="fs-score">{fmtScore(f.score)}</b>
            {diff != null && <small className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? '+' : '−'}{fmtScore(Math.abs(diff))}</small>}
          </Link>
        );
      })}
      {list.length > 3 && <button className="link small" onClick={() => setAll((x) => !x)}>{all ? t('Mostrar menos') : t('Ver todos ({n})', { n: list.length })}</button>}
    </div>
  );
}

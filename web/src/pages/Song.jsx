import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import TrainingToggle from '../components/TrainingToggle.jsx';
import { ChartRanking } from './Players.jsx';
import { Ball, fmtDate, Grade, Jacket, Plate, RiseBadge } from '../components/ui.jsx';
import { chartHistory } from '../lib/api.js';
import { chartRating, chartTier, DIFF_PT, fmtScore, nextGrade, TIERS, VERSIONS } from '../lib/piu.js';
import { videoUrl } from '../lib/style.js';
import { rpc } from '../lib/api.js';
import ChartReviews, { reviewTagLabel } from '../components/ChartReviews.jsx';
import { SpecialAdmin, SpecialBadges } from '../components/Special.jsx';
import { chartTagLabel, tagColor } from '../lib/tags.js';
import { t } from '../lib/i18n.js';
import { canAdmin } from '../lib/admin.js';
import { ChevronRight, History, PencilLine, Play, Star, Trophy, Users } from '../components/Icons.jsx';
import { usePrefs } from '../lib/prefs.js';
import AdSlot from '../components/AdSlot.jsx';
import { entitlements } from '../lib/plans.js';
import { Crown } from '../components/Icons.jsx';

export default function Song() {
  const { id } = useParams();
  const { data, version, reload, plan } = useData();
  const song = data.songs.find((s) => String(s.id) === id);
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
  const groups = [['S', 'Single'], ['D', 'Double'], ['HD', 'Half-Double'], ['C', 'Co-op']]
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
            {song.isNew && <span className="tag new">NEW</span>}
            {song.bpm && <span className="tag">{song.bpm} BPM</span>}
            {song.songType && <span className="tag">{song.songType}</span>}
            {song.rise && <RiseBadge />}
          </div>
          {song.rise && <p className="small muted rise-note">{t('Música do PUMP IT UP R!SE. Na Phoenix 2 ela só aparece para quem ligou a conta Steam do R!SE ao AM.PASS.')}</p>}
          {canAdmin(plan, 'charts') && <RiseAdmin song={song} onChange={reload} />}
          <a className="btn yt" href={videoUrl('s', song.id, song.title)} target="_blank" rel="noreferrer"><Play size={16} fill="currentColor" /> {t('Ver no YouTube')}</a>
          {canAdmin(plan, 'charts') && <VideoAdmin vkey={`s:${song.id}`} />}
        </div>
      </section>

      {hasLegacy && <LegacyToggle />}

      {groups.map(([label, charts]) => (
        <section key={label}>
          <h3 className="group-h">{label}{label === 'Half-Double' && <RiseBadge small />}</h3>
          {label === 'Half-Double' && <p className="small muted rise-note">{t('Charts de 6 painéis do canal R!SE MIX. Só aparecem na Phoenix 2 com a conta Steam do R!SE ligada ao AM.PASS e não contam para o PUMBILITY.')}</p>}
          {charts.map((c) => <ChartCard key={c.id} chart={c} version={version} other={other} friends={friendsOf(c.id)} focus={focus === c.id} onReviewed={() => reload()} />)}
        </section>
      ))}
      <AdSlot place="song" />
    </div>
  );
}

const ytId = (s) => (String(s || '').trim().match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/) || String(s || '').trim().match(/^([\w-]{11})$/) || [])[1] || null;

/** Admin: marca a música como do R!SE (só abre com a conta Steam ligada). */
function RiseAdmin({ song, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flip = async () => {
    setBusy(true); setErr('');
    try { await rpc('admin_set_song_rise', { p_song: song.id, p_rise: !song.rise }); await onChange?.(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <p className="small">
      <button className="link small muted" disabled={busy} onClick={flip}>
        {song.rise ? t('Admin: tirar marca de música do R!SE') : t('Admin: marcar como música do R!SE')}
      </button>
      {err && <span className="form-err"> {err}</span>}
    </p>
  );
}

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

function ChartCard({ chart: c, version, other, friends, focus, onReviewed }) {
  const { plan } = useData();
  const [prefs] = usePrefs();
  const legacyMode = version === 'phoenix2';
  const showOther = c.otherScore != null && (!legacyMode || prefs.legacyP1);
  const ent = entitlements(plan);
  const months = ent.can('history_full') ? null : ent.limit('history_months');
  const histCut = months ? new Date(Date.now() - months * 30.4 * 86400000) : null;
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
        <Link to={`/chart/${c.id}`} className="cc-ball" title={t('Abrir a página deste nível')}><Ball chart={c} /></Link>
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
        <SpecialBadges chart={c} />
        {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{t(tier.label)}{c.scoringLevel ? ` · ${c.scoringLevel.toFixed(1)}` : ''}</span>}
        {c.passDifficulty && c.passDifficulty !== 'Unrecorded' && <span className="tag">Clear: {t(DIFF_PT[c.passDifficulty] || c.passDifficulty)}</span>}
        {c.stepArtist && <span className="tag ic-row"><PencilLine size={12} /> {c.stepArtist}</span>}
        {c.notes ? <span className="tag">{t('{n} notas', { n: c.notes })}</span> : null}
        {!c.tagBars && c.skills.map((s) => <span key={s} className="tag skill">{s}</span>)}
        {c.community?.tags?.length > 0 && (
          <span className="tag community" title={t('Tags marcadas pela comunidade do PIU Stats')}>
            <Users size={12} /> {c.community.tags.map((x) => t(reviewTagLabel(x))).join(' · ')}
          </span>
        )}
      </div>
      {c.tagBars && (
        <div className="cc-style">
          {c.tagBars.slice(0, 3).map(([x, v]) => <span key={x} className="st-chip" style={{ '--c': tagColor(x) }}>{t(chartTagLabel(x))} {v}%</span>)}
        </div>
      )}

      {showOther && (
        <div className={`cc-other ${legacyMode ? 'legacy' : ''}`}>
          {legacyMode ? <span className="legacy-tag"><History size={12} /> {t('Legado Phoenix')}</span> : `${other.name}:`} <b>{fmtScore(c.otherScore)}</b> <Grade grade={c.otherGrade} size="sm" /> <Plate plate={c.otherPlate} />
          {c.score != null && <span className={c.score >= c.otherScore ? 'up' : 'down'}> {c.score >= c.otherScore ? '▲' : '▼'} {fmtScore(Math.abs(c.score - c.otherScore))}</span>}
        </div>
      )}

      {c.achievedAt && <div className="cc-date muted">{t('Recorde em {d}', { d: fmtDate(c.achievedAt) })}</div>}
      <div className="cc-actions">
        <TrainingToggle chart={c} action />
        <a href={yt} target="_blank" rel="noreferrer" className="cc-act yt"><Play size={16} fill="currentColor" /><span>YouTube</span></a>
        <button type="button" className={`cc-act ${reviews ? 'on' : ''}`} onClick={() => setReviews((r) => !r)} aria-expanded={reviews}>
          <Star size={16} /><span>{t('Avaliar')}</span>
          {c.community?.votes > 0 && <em className="cc-count" aria-label={t('{n} avaliações', { n: c.community.votes })}>{c.community.votes}</em>}
        </button>
        <button type="button" className={`cc-act ${rank ? 'on' : ''}`} onClick={() => setRank((r) => !r)} aria-expanded={rank}><Trophy size={16} /><span>{t('Ranking')}</span></button>
        <button type="button" className={`cc-act ${open ? 'on' : ''}`} onClick={toggle} aria-expanded={open}><History size={16} /><span>{t('Histórico')}</span></button>
        <Link to={`/chart/${c.id}`} className="cc-act"><ChevronRight size={16} /><span>{t('Detalhes')}</span></Link>
      </div>
      {canAdmin(plan, 'charts') && <VideoAdmin vkey={`c:${c.id}`} />}
      {canAdmin(plan, 'charts') && <SpecialAdmin chart={c} onSaved={onReviewed} />}

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
export function useFriendScores(songId, version) {
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

export function FriendScores({ list, mine }) {
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

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { ChartRanking } from './Players.jsx';
import { Ball, fmtDate, Grade, Jacket, Plate } from '../components/ui.jsx';
import { chartHistory } from '../lib/api.js';
import { chartLabel, chartRating, chartTier, DIFF_PT, fmtScore, nextGrade, TIERS, VERSIONS } from '../lib/piu.js';
import { topStyles, useStyles, youtubeUrl } from '../lib/style.js';
import StyleBars from '../components/StyleBars.jsx';
import ChartReviews, { REVIEW_TAGS } from '../components/ChartReviews.jsx';
import { t } from '../lib/i18n.js';
import { ChevronDown, ChevronUp, History, PencilLine, Play, Users } from '../components/Icons.jsx';
import { usePrefs } from '../lib/prefs.js';
import { entitlements } from '../lib/plans.js';
import { Crown } from '../components/Icons.jsx';

export default function Song() {
  const { id } = useParams();
  const { data, version, reload } = useData();
  const song = data.songs.find((s) => String(s.id) === id);
  const styleOf = useStyles(song ? [song.id] : []);
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
          <a className="btn yt" href={youtubeUrl(song.title)} target="_blank" rel="noreferrer"><Play size={16} fill="currentColor" /> {t('Ver no YouTube')}</a>
        </div>
      </section>

      {hasLegacy && <LegacyToggle />}

      {groups.map(([label, charts]) => (
        <section key={label}>
          <h3 className="group-h">{label}</h3>
          {charts.map((c) => <ChartCard key={c.id} chart={c} version={version} other={other} style={styleOf(c)} onReviewed={() => reload()} />)}
        </section>
      ))}
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

function ChartCard({ chart: c, version, other, style, onReviewed }) {
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
  const yt = youtubeUrl(c.song.title, chartLabel(c).replace(' ', ''));

  const toggle = async () => {
    setOpen((o) => !o);
    if (!hist) { try { setHist(await chartHistory(c.id)); } catch { setHist({ bests: [], plays: [] }); } }
  };

  return (
    <div className={`chartcard ${c.score != null ? 'played' : ''}`}>
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

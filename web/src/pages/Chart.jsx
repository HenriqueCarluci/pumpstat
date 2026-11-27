import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import TrainingToggle from '../components/TrainingToggle.jsx';
import { ChartRanking } from './Players.jsx';
import { FriendScores, useFriendScores } from './Song.jsx';
import { Ball, fmtDate, Grade, Jacket, Plate, RiseBadge } from '../components/ui.jsx';
import { chartHistory, rpc } from '../lib/api.js';
import { chartRating, chartTier, DIFF_PT, fmtScore, GRADE_ORDER, nextGrade, TIERS } from '../lib/piu.js';
import { topStyles, useStyles, videoUrl } from '../lib/style.js';
import StyleBars from '../components/StyleBars.jsx';
import ChartReviews, { reviewTagLabel } from '../components/ChartReviews.jsx';
import { SpecialBadges } from '../components/Special.jsx';
import { isUnique } from '../lib/special.js';
import { chartTagLabel } from '../lib/tags.js';
import { fmtNum, t, tn } from '../lib/i18n.js';
import { ChevronLeft, History, PencilLine, Play, Users } from '../components/Icons.jsx';
import { entitlements } from '../lib/plans.js';

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** Página de um chart (uma música num nível): informações, tags, números da comunidade, amigos e comentários. */
export default function Chart() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, version, reload, plan } = useData();
  const c = data.byId.get(Number(id));
  const styleOf = useStyles(c ? [c.songId] : []);
  const friendsOf = useFriendScores(c?.songId, version);
  const [stats, setStats] = useState(null);
  const [hist, setHist] = useState(null);
  const ent = entitlements(plan);

  useEffect(() => {
    setStats(null); setHist(null);
    if (!c) return;
    rpc('chart_stats', { p_chart: c.id }).then(setStats).catch(() => setStats({}));
    chartHistory(c.id).then(setHist).catch(() => setHist({ bests: [], plays: [] }));
  }, [c?.id]); // eslint-disable-line

  if (!c) return <div className="page"><p className="empty">{t('Chart não encontrado nesta versão.')}</p><Link to="/musicas">{t('Voltar')}</Link></div>;

  const song = c.song;
  const style = styleOf(c);
  const tier = TIERS.find((x) => x.id === chartTier(c));
  const rating = chartRating(version, c.mode, c.level, c.score, c.grade, c.plate, c.broken);
  const nxt = c.score != null && !c.broken ? nextGrade(version, c.score) : null;
  const siblings = song.charts;
  const grades = stats?.grades ? GRADE_ORDER.filter((g) => stats.grades[g]).map((g) => [g, stats.grades[g]]) : [];
  const gMax = Math.max(1, ...grades.map(([, n]) => n));
  const refTags = c.tags || [];
  const commTags = c.community?.tags || [];

  return (
    <div className="page chart-page">
      <div className="cp-top">
        <button className="icon-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav(`/musica/${song.id}`))} aria-label={t('Voltar')}><ChevronLeft size={22} /></button>
        <Link to={`/musica/${song.id}`} className="cp-song">{song.title}</Link>
      </div>

      <section className="cp-hero">
        <Jacket song={song} width={640} className="cp-jacket" />
        <span className="cp-ball"><Ball chart={c} /></span>
      </section>

      <div className="cp-levels" role="tablist" aria-label={t('Outros níveis da música')}>
        {siblings.map((x) => (
          <Link key={x.id} to={`/chart/${x.id}`} replace className={`cp-lv ${x.id === c.id ? 'on' : ''}`} aria-current={x.id === c.id}>
            <Ball chart={x} size="sm" />
          </Link>
        ))}
      </div>

      <div className="cp-actions">
        <a href={videoUrl('c', c.id, song.title, `${c.mode}${c.level}`)} target="_blank" rel="noreferrer" className="cc-act yt"><Play size={16} fill="currentColor" /><span>YouTube</span></a>
        <TrainingToggle chart={c} action />
        <span className="cp-badges">
          {isUnique(c) && <span className="tag tier-special">Unique</span>}
          {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{t(tier.label)}</span>}
          <SpecialBadges chart={c} compact />
          {song.rise && <RiseBadge small />}
        </span>
      </div>

      {c.score != null && (
        <section className="card cp-mine">
          <div className="cp-mine-main">
            <div>
              <small className="muted">{t('Seu recorde')}</small>
              <div className="sc">{fmtScore(c.score)}</div>
              {c.achievedAt && <small className="muted">{fmtDate(c.achievedAt)}</small>}
            </div>
            <div className="cp-mine-gp"><Grade grade={c.grade} broken={c.broken} /><Plate plate={c.plate} /></div>
          </div>
          <div className="cp-mine-sub">
            {rating > 0 && <span className="tag">{t('{n} pontos no PUMBILITY', { n: rating.toFixed(1) })}</span>}
            {nxt && <span className="tag">{t('+{n} p/ {g}', { n: fmtScore(nxt.need), g: nxt.grade })}</span>}
            {c.broken && <span className="tag warn">stage break</span>}
          </div>
        </section>
      )}

      <section className="card cp-stats">
        <h3><Users size={16} /> {t('No PIU Stats')}</h3>
        {!stats && <p className="muted small">{t('Carregando…')}</p>}
        {stats && stats.players != null && (
          <>
            <div className="cp-rate">
              <div className="cp-rate-row"><span>{t('Jogadores que passaram')}</span><b>{stats.clears} / {stats.players}</b><span className="muted">{pct(stats.clears, stats.players)}%</span></div>
              <span className="cp-bar"><i style={{ width: `${pct(stats.clears, stats.players)}%` }} /></span>
            </div>
            <div className="cp-rate">
              <div className="cp-rate-row"><span>{t('Jogadas registradas que passaram')}</span><b>{stats.play_passes} / {stats.plays}</b><span className="muted">{pct(stats.play_passes, stats.plays)}%</span></div>
              <span className="cp-bar alt"><i style={{ width: `${pct(stats.play_passes, stats.plays)}%` }} /></span>
            </div>
            {stats.avg != null && <p className="small muted">{t('Média de quem passou: {s}', { s: fmtScore(stats.avg) })}</p>}
            {grades.length > 0 && (
              <div className="cp-grades">
                {grades.map(([g, n]) => (
                  <div key={g} className="cp-grade"><Grade grade={g} size="xs" /><span className="cp-bar"><i style={{ width: `${(n / gMax) * 100}%` }} /></span><b>{n}</b></div>
                ))}
              </div>
            )}
          </>
        )}
        {stats && stats.players == null && <p className="muted small">{t('Entre na sua conta para ver os números da comunidade.')}</p>}
      </section>

      {(refTags.length > 0 || commTags.length > 0 || style) && (
        <section className="card cp-tags">
          <h3>{t('Tags')}</h3>
          {refTags.length > 0 && <div className="cp-chips">{refTags.map((x) => <span key={x} className={`tag cp-tag t-${x}`}>#{t(chartTagLabel(x))}</span>)}</div>}
          {commTags.length > 0 && (
            <p className="small muted cp-comm"><Users size={12} /> {t('Comunidade do PIU Stats:')} {commTags.map((x) => t(reviewTagLabel(Array.isArray(x) ? x[0] : x))).join(' · ')}</p>
          )}
          {style && (
            <>
              <div className="cp-style">{topStyles(style, 4).map((k) => <span key={k.id} className="st-chip" style={{ '--c': k.color }}>{t(k.label)} {Math.round(k.v)}%</span>)}</div>
              <StyleBars style={style} locked={!ent.can('style_full')} />
            </>
          )}
        </section>
      )}

      <section className="card cp-info">
        <h3>{t('Detalhes')}</h3>
        <dl>
          {song.bpm && <><dt>BPM</dt><dd>{song.bpm}</dd></>}
          <dt>{t('Artista')}</dt><dd>{song.artist || '—'}</dd>
          {c.stepArtist && <><dt>{t('Step')}</dt><dd className="ic-row"><PencilLine size={12} /> {c.stepArtist}</dd></>}
          {c.notes ? <><dt>{t('Notas')}</dt><dd>{fmtNum(c.notes)}</dd></> : null}
          {c.scoringLevel ? <><dt>{t('Nível efetivo')}</dt><dd>{c.scoringLevel.toFixed(2)}</dd></> : null}
          {tier && tier.id !== 'unknown' && <><dt>{t('Tier')}</dt><dd>{t(tier.label)}{c.community?.votes ? ` · ${tn(c.community.votes, '{n} voto', '{n} votos')}` : ''}</dd></>}
          {c.passDifficulty && c.passDifficulty !== 'Unrecorded' && <><dt>{t('Dificuldade de clear')}</dt><dd>{t(DIFF_PT[c.passDifficulty] || c.passDifficulty)}</dd></>}
          {song.songType && <><dt>{t('Tipo')}</dt><dd>{song.songType}</dd></>}
        </dl>
      </section>

      <section className="card">
        <h3>{t('Amigos')}</h3>
        <FriendScores list={friendsOf(c.id)} mine={c} />
        <ChartRanking chartId={c.id} />
      </section>

      <section className="card">
        <h3>{t('Avaliações e comentários')}</h3>
        <ChartReviews chart={c} onSaved={() => reload()} />
      </section>

      {hist && (hist.plays.length > 0 || hist.bests.length > 0) && (
        <section className="card">
          <h3><History size={16} /> {t('Seu histórico')}</h3>
          {hist.plays.slice(0, 30).map((p, i) => (
            <div key={i} className="hrow">
              <span className="muted">{fmtDate(p[0])}</span>
              <span className="sc">{fmtScore(p[1])}</span>
              <Grade grade={p[2]} broken={p[9]} size="sm" />
              <Plate plate={p[3]} />
              <span className="judg">{p[4]}/{p[5]}/{p[6]}/{p[7]}/<b>{p[8]}</b></span>
            </div>
          ))}
          {hist.bests.length > 0 && <div className="muted small">{t('Evolução do recorde:')} {hist.bests.map((b) => fmtScore(b[1])).join(' → ')}</div>}
        </section>
      )}
    </div>
  );
}

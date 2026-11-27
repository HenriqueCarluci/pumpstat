import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import TrainingToggle from '../components/TrainingToggle.jsx';
import { ChartRanking } from './Players.jsx';
import { FriendScores, useFriendScores } from './Song.jsx';
import { Ball, fmtDate, Grade, Jacket, Plate, RiseBadge } from '../components/ui.jsx';
import { cachedVersion, chartHistory, rpc } from '../lib/api.js';
import { chartRating, chartTier, fmtBpm, fmtScore, GRADE_ORDER, nextGrade, TIERS, VERSIONS } from '../lib/piu.js';
import { videoUrl } from '../lib/style.js';
import ChartReviews, { reviewTagLabel } from '../components/ChartReviews.jsx';
import { SpecialBadges } from '../components/Special.jsx';
import { isUnique } from '../lib/special.js';
import { chartTagLabel, tagColor } from '../lib/tags.js';
import ChartTagsAdmin from '../components/ChartTagsAdmin.jsx';
import { canAdmin } from '../lib/admin.js';
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
  const friendsOf = useFriendScores(c?.songId, version);
  const [stats, setStats] = useState(null);
  const [editTags, setEditTags] = useState(false);
  const [hist, setHist] = useState(null);
  const ent = entitlements(plan);

  useEffect(() => {
    setStats(null); setHist(null);
    if (!c) return;
    rpc('chart_stats', { p_chart: c.id }).then(setStats).catch(() => setStats({}));
    chartHistory(c.id).then(setHist).catch(() => setHist({ bests: [], plays: [] }));
  }, [c?.id]); // eslint-disable-line

  // trocou a versão da Pump estando num chart: cada versão tem os próprios ids, então procura o mesmo nível da música
  const lastRef = useRef(null);
  if (c) lastRef.current = { songId: c.songId, mode: c.mode, level: c.level };
  let key = lastRef.current;
  if (!c && !key) {
    for (const v of Object.keys(VERSIONS)) {
      if (v === version) continue;
      const x = cachedVersion(v)?.byId.get(Number(id));
      if (x) { key = { songId: x.songId, mode: x.mode, level: x.level }; break; }
    }
  }
  const alt = !c && key ? data.charts.find((x) => x.songId === key.songId && x.mode === key.mode && x.level === key.level) : null;
  useEffect(() => { if (alt) nav(`/chart/${alt.id}`, { replace: true }); }, [alt?.id]); // eslint-disable-line

  if (!c) {
    const songHere = key && data.songs.find((s) => s.id === key.songId);
    if (alt) return <div className="page"><p className="empty">{t('Carregando…')}</p></div>;
    return (
      <div className="page">
        <p className="empty">{songHere
          ? t('Esta música não tem o {m}{l} na {v}.', { m: key.mode, l: key.level, v: VERSIONS[version]?.name || version })
          : t('Chart não encontrado nesta versão.')}</p>
        {songHere ? <Link className="btn ghost" to={`/musica/${songHere.id}`}>{t('Ver os níveis da música nesta versão')}</Link> : <Link to="/musicas">{t('Voltar')}</Link>}
      </div>
    );
  }

  const song = c.song;
  const tier = TIERS.find((x) => x.id === chartTier(c));
  const rating = chartRating(version, c.mode, c.level, c.score, c.grade, c.plate, c.broken);
  const nxt = c.score != null && !c.broken ? nextGrade(version, c.score) : null;
  const siblings = song.charts;
  const grades = stats?.grades ? GRADE_ORDER.filter((g) => stats.grades[g]).map((g) => [g, stats.grades[g]]) : [];
  const gMax = Math.max(1, ...grades.map(([, n]) => n));
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

      {(c.tagBars || commTags.length > 0 || canAdmin(plan, 'charts')) && (
        <section className="card cp-tags">
          <div className="row-between">
            <h3>{t('Tags')}{c.tagsEdited && <small className="muted tiny"> · {t('ajustado pela equipe')}</small>}</h3>
            {canAdmin(plan, 'charts') && !editTags && <button className="link small" onClick={() => setEditTags(true)}>{t('Editar tags')}</button>}
          </div>
          {editTags && <ChartTagsAdmin chart={c} onSaved={reload} onClose={() => setEditTags(false)} />}
          {!editTags && c.tagBars && (
            <div className="cp-skill">
              {(ent.can('style_full') ? c.tagBars : c.tagBars.slice(0, 3)).map(([x, v]) => (
                <div key={x} className="cp-skill-row"><span>{t(chartTagLabel(x))}</span><i><b style={{ width: `${v}%`, background: tagColor(x) }} /></i><em>{v}%</em></div>
              ))}
              {!ent.can('style_full') && c.tagBars.length > 3 && <p className="tiny muted">{t('As 3 skills principais. Todas ficam no Plus.')}</p>}
            </div>
          )}
          {commTags.length > 0 && (
            <p className="small muted cp-comm"><Users size={12} /> {t('Comunidade do PIU Stats:')} {commTags.map((x) => t(reviewTagLabel(Array.isArray(x) ? x[0] : x))).join(' · ')}</p>
          )}
        </section>
      )}

      <section className="card cp-info">
        <h3>{t('Detalhes')}</h3>
        <dl>
          {song.bpm && <><dt>BPM</dt><dd>{fmtBpm(song.bpm)}</dd></>}
          <dt>{t('Artista')}</dt><dd>{song.artist || '—'}</dd>
          {c.stepArtist && <><dt>{t('Step')}</dt><dd className="ic-row"><PencilLine size={12} /> {c.stepArtist}</dd></>}
          {c.notes ? <><dt>{t('Notas')}</dt><dd>{fmtNum(c.notes)}</dd></> : null}
          {c.scoringLevel ? <><dt>{t('Nível efetivo')}</dt><dd>{c.scoringLevel.toFixed(2)}</dd></> : null}
          {tier && tier.id !== 'unknown' && <><dt>{t('Tier')}</dt><dd>{t(tier.label)}{c.community?.votes ? ` · ${tn(c.community.votes, '{n} voto', '{n} votos')}` : ''}</dd></>}
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

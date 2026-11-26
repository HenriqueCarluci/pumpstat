import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { ChartRanking } from './Players.jsx';
import { Ball, fmtDate, Grade, Jacket, Plate } from '../components/ui.jsx';
import { chartHistory } from '../lib/api.js';
import { chartLabel, chartRating, chartTier, DIFF_PT, fmtScore, nextGrade, TIERS, VERSIONS } from '../lib/piu.js';
import { topStyles, useStyles, youtubeUrl } from '../lib/style.js';
import StyleBars from '../components/StyleBars.jsx';

export default function Song() {
  const { id } = useParams();
  const { data, version } = useData();
  const song = data.songs.find((s) => String(s.id) === id);
  const styleOf = useStyles(song ? [song.id] : []);
  if (!song) return <div className="page"><p className="empty">Música não encontrada nesta versão.</p><Link to="/musicas">Voltar</Link></div>;

  const other = version === 'phoenix2' ? VERSIONS.phoenix : VERSIONS.phoenix2;
  const groups = [['S', 'Single'], ['D', 'Double'], ['C', 'Co-op']]
    .map(([m, label]) => [label, song.charts.filter((c) => c.mode === m)])
    .filter(([, cs]) => cs.length);

  return (
    <div className="page">
      <section className="song-hero">
        <Jacket song={song} width={220} className="hero-jacket" />
        <div>
          <h1>{song.title}</h1>
          <div className="muted">{song.artist || 'Artista desconhecido'}</div>
          <div className="tags">
            {song.bpm && <span className="tag">{song.bpm} BPM</span>}
            {song.songType && <span className="tag">{song.songType}</span>}
          </div>
          <a className="btn yt" href={youtubeUrl(song.title)} target="_blank" rel="noreferrer">▶ Ver no YouTube</a>
        </div>
      </section>

      {groups.map(([label, charts]) => (
        <section key={label}>
          <h3 className="group-h">{label}</h3>
          {charts.map((c) => <ChartCard key={c.id} chart={c} version={version} other={other} style={styleOf(c)} />)}
        </section>
      ))}
    </div>
  );
}

function ChartCard({ chart: c, version, other, style }) {
  const [showStyle, setShowStyle] = useState(false);
  const [hist, setHist] = useState(null);
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState(false);
  const rating = chartRating(version, c.mode, c.level, c.score, c.grade, c.plate, c.broken);
  const nxt = c.score != null && !c.broken ? nextGrade(version, c.score) : null;
  const tier = TIERS.find((t) => t.id === chartTier(c));
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
          {rating > 0 && <div className="rating" title="Valor estimado no PUMBILITY">{rating.toFixed(2)}</div>}
          {nxt && <div className="need">+{fmtScore(nxt.need)} p/ {nxt.grade}</div>}
        </div>
      </div>

      <div className="cc-meta">
        {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{tier.label}{c.scoringLevel ? ` · ${c.scoringLevel.toFixed(1)}` : ''}</span>}
        {c.passDifficulty && c.passDifficulty !== 'Unrecorded' && <span className="tag">Clear: {DIFF_PT[c.passDifficulty] || c.passDifficulty}</span>}
        {c.stepArtist && <span className="tag">✎ {c.stepArtist}</span>}
        {c.notes ? <span className="tag">{c.notes} notas</span> : null}
        {c.skills.map((s) => <span key={s} className="tag skill">{s}</span>)}
      </div>
      {style && (
        <button className="cc-style" onClick={() => setShowStyle((v) => !v)} title="Ver estilo do chart">
          {topStyles(style).map((k) => <span key={k.id} className="st-chip" style={{ '--c': k.color }}>{k.label} {Math.round(k.v)}%</span>)}
          {style.nps != null && <span className="muted small">{style.nps} notas/s</span>}
          <span className="muted small">{showStyle ? '▲' : '▼'}</span>
        </button>
      )}
      {style && showStyle && <StyleBars style={style} />}

      {c.otherScore != null && (
        <div className="cc-other">
          {other.name}: <b>{fmtScore(c.otherScore)}</b> <Grade grade={c.otherGrade} size="sm" /> <Plate plate={c.otherPlate} />
          {c.score != null && <span className={c.score >= c.otherScore ? 'up' : 'down'}> {c.score >= c.otherScore ? '▲' : '▼'} {fmtScore(Math.abs(c.score - c.otherScore))}</span>}
        </div>
      )}

      <div className="cc-actions">
        {c.achievedAt && <span className="muted">Recorde em {fmtDate(c.achievedAt)}</span>}
        <span className="spacer" />
        <a href={yt} target="_blank" rel="noreferrer" className="link">▶ YouTube</a>
        <button className="link" onClick={() => setRank((r) => !r)}>{rank ? 'Fechar' : 'Ranking'}</button>
        <button className="link" onClick={toggle}>{open ? 'Fechar' : 'Histórico'}</button>
      </div>

      {rank && <div className="cc-hist"><ChartRanking chartId={c.id} /></div>}
      {open && (
        <div className="cc-hist">
          {!hist && <p className="muted">Carregando…</p>}
          {hist && !hist.plays.length && !hist.bests.length && <p className="muted">Sem histórico registrado ainda.</p>}
          {hist?.plays?.map((p, i) => (
            <div key={i} className="hrow">
              <span className="muted">{fmtDate(p[0])}</span>
              <span className="sc">{fmtScore(p[1])}</span>
              <Grade grade={p[2]} broken={p[9]} size="sm" />
              <Plate plate={p[3]} />
              <span className="judg">{p[4]}/{p[5]}/{p[6]}/{p[7]}/<b>{p[8]}</b></span>
            </div>
          ))}
          {hist?.bests?.length > 0 && (
            <div className="muted small">Evolução do recorde: {hist.bests.map((b) => fmtScore(b[1])).join(' → ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

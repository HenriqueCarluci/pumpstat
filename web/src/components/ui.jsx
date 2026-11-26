import { Link } from 'react-router-dom';
import { chartLabel, fmtScore, gradeTier, PLATES } from '../lib/piu.js';
import { locale, t } from '../lib/i18n.js';

// Imagens oficiais do site da Phoenix 2 (carregadas direto do piugame.com).
const IMG = 'https://piugame.com/l_img/p2';
const GRADE_CODE = { 'SSS+': 'sss_p', SSS: 'sss', 'SS+': 'ss_p', SS: 'ss', 'S+': 's_p', S: 's', 'AAA+': 'aaa_p', AAA: 'aaa',
  'AA+': 'aa_p', AA: 'aa', 'A+': 'a_p', A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' };
const imgProps = { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', draggable: false };
export const gradeImgUrl = (grade, broken) => (grade ? `${IMG}/grade/${(broken ? 'x_' : '') + (GRADE_CODE[grade] || grade.toLowerCase())}.png` : null);
export const plateImgUrl = (plate) => (plate ? `${IMG}/plate/${plate.toLowerCase()}.png` : null);

/** Bolinha de nível no estilo do jogo (single vermelho, double verde, half-double azul, co-op amarelo). */
export function Ball({ chart, size = 'md' }) {
  const kind = chart.mode === 'S' ? 's' : chart.mode === 'D' ? 'd' : chart.mode === 'HD' ? 'hd' : 'c';
  const digits = String(chart.level).split('');
  return (
    <span className={`ball ${size}`} title={chartLabel(chart)} style={{ backgroundImage: `url(${IMG}/stepball/full/${kind}_bg.png)` }}>
      <img className="ball-text" src={`${IMG}/stepball/full/${kind}_text.png`} {...imgProps} />
      <span className="ball-num">
        {kind === 'c' && <b className="ball-x">×</b>}
        {digits.map((d, i) => <img key={i} src={`${IMG}/stepball/full/s_num_${d}.png`} {...imgProps} />)}
      </span>
    </span>
  );
}

/** Selo do R!SE: música ou chart que precisa do PUMP IT UP R!SE (Steam) ligado ao AM.PASS. */
export function RiseBadge({ small, full = true }) {
  return (
    <span className={`rise-badge ${small ? 'sm' : ''}`}
      title={full ? t('Música do R!SE: precisa do PUMP IT UP R!SE (Steam) ligado ao seu AM.PASS')
        : t('Tem charts Half-Double do R!SE: precisam do PUMP IT UP R!SE (Steam) ligado ao seu AM.PASS')}>
      R!SE
    </span>
  );
}

export function Grade({ grade, broken, size = 'md' }) {
  if (!grade) return <span className={`grade-img none ${size}`}>—</span>;
  const code = (broken ? 'x_' : '') + (GRADE_CODE[grade] || grade.toLowerCase());
  return <img className={`grade-img ${size}`} src={`${IMG}/grade/${code}.png`} title={broken ? `${grade} (stage break)` : grade} {...imgProps} alt={grade} />;
}

export function Plate({ plate, size = 'md' }) {
  if (!plate) return null;
  return <img className={`plate-img ${size}`} src={`${IMG}/plate/${plate.toLowerCase()}.png`} title={PLATES[plate] || plate} {...imgProps} alt={plate} />;
}

/** Capa da música (banner 16:9 do jogo) ou um placeholder com as iniciais. */
export function Jacket({ song, width = 96, className = '' }) {
  const initials = (song.title || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hue = [...(song.title || '')].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) % 360, 7);
  return (
    <div className={`jacket ${className}`} style={{ width, '--hue': hue }}>
      {song.jacket ? <img src={song.jacket} {...imgProps} /> : <span>{initials}</span>}
    </div>
  );
}

/** Bolinha pequena de nível colorida pelo grade obtido (lista de músicas). */
export function ChartPip({ chart, legacy }) {
  const gt = chart.score != null ? gradeTier(chart.grade) : legacy ? gradeTier(legacy.grade) : 'none';
  const title = chart.score != null ? ` · ${fmtScore(chart.score)} ${chart.grade || ''}`
    : legacy ? ` · ${t('Legado Phoenix')}: ${fmtScore(legacy.score)} ${legacy.grade || ''}` : '';
  return (
    <span className={`pip ${chart.mode === 'S' ? 'single' : chart.mode === 'D' ? 'double' : chart.mode === 'HD' ? 'halfdouble' : 'coop'} t-${gt} ${chart.broken ? 'broken' : ''} ${legacy ? 'legacy' : ''}`}
      title={`${chartLabel(chart)}${title}`}>
      {chart.mode === 'C' ? `×${chart.level}` : chart.level}
    </span>
  );
}

export function SongRow({ song, filter, legacy }) {
  const charts = filter ? song.charts.filter(filter) : song.charts;
  return (
    <Link to={`/musica/${song.id}`} className="songrow">
      <Jacket song={song} width={92} />
      <div className="songrow-main">
        <div className="title">{song.title}{(song.rise || song.hasHD) && <RiseBadge small full={song.rise} />}</div>
        <div className="sub">{song.artist || '—'}{song.bpm ? ` · ${song.bpm} BPM` : ''}</div>
        <div className="pips">{charts.map((c) => <ChartPip key={c.id} chart={c} legacy={legacy ? legacy(c) : null} />)}</div>
      </div>
    </Link>
  );
}

/** Cartão no estilo "My Best Score" do site: capa ao fundo, bolinha, grade, score e plate. */
export function ScoreCard({ chart, score, grade, plate, broken, date, to, extra }) {
  const body = (
    <>
      <div className="sc-bg" style={chart.song.jacket ? { backgroundImage: `url(${chart.song.jacket})` } : undefined} />
      <div className="sc-name">{chart.song.title}</div>
      <div className="sc-row">
        <Ball chart={chart} />
        <div className="sc-grade">
          <Grade grade={grade} broken={broken} />
          <span className="sc-score">{fmtScore(score)}</span>
        </div>
        <div className="sc-plate">{plate ? <Plate plate={plate} /> : null}</div>
      </div>
      {extra}
      {date && <div className="sc-date">{fmtDate(date)}</div>}
    </>
  );
  return to ? <Link to={to} className="scorecard">{body}</Link> : <div className="scorecard">{body}</div>;
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export function timeAgo(iso) {
  if (!iso) return t('nunca');
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return t('agora');
  if (d < 3600) return t('há {n} min', { n: Math.floor(d / 60) });
  if (d < 86400) return t('há {n} h', { n: Math.floor(d / 3600) });
  if (d < 86400 * 30) return t('há {n} d', { n: Math.floor(d / 86400) });
  return new Date(iso).toLocaleDateString(locale());
}

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '—');

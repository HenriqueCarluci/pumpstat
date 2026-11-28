import { useState } from 'react';
import { Link } from 'react-router-dom';
import { chartLabel, fmtBpm, fmtScore, gradeTier, PLATES } from '../lib/piu.js';
import { locale, t } from '../lib/i18n.js';
import { img, remoteImg } from '../lib/imgStore.js';

// Imagens oficiais do site da Phoenix 2 (carregadas direto do piugame.com).
const IMG = 'https://piugame.com/l_img/p2';
const GRADE_CODE = { 'SSS+': 'sss_p', SSS: 'sss', 'SS+': 'ss_p', SS: 'ss', 'S+': 's_p', S: 's', 'AAA+': 'aaa_p', AAA: 'aaa',
  'AA+': 'aa_p', AA: 'aa', 'A+': 'a_p', A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' };
const imgProps = { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', draggable: false };
export const gradeImgUrl = (grade, broken) => (grade ? `${IMG}/grade/${(broken ? 'x_' : '') + (GRADE_CODE[grade] || grade.toLowerCase())}.png` : null);
/** Imagens fixas do jogo usadas no app (notas, plates e bolinhas de nível), para baixar tudo de uma vez no app. */
export function staticImageUrls() {
  const codes = Object.values(GRADE_CODE);
  return [
    ...codes.flatMap((c) => [`${IMG}/grade/${c}.png`, `${IMG}/grade/x_${c}.png`]),
    ...Object.keys(PLATES).map((p) => `${IMG}/plate/${p.toLowerCase()}.png`),
    ...['s', 'd', 'hd', 'c'].flatMap((k) => [`${IMG}/stepball/full/${k}_bg.png`, `${IMG}/stepball/full/${k}_text.png`]),
    ...[...'0123456789'].map((d) => `${IMG}/stepball/full/s_num_${d}.png`),
    // ícones de faixa da PUMBILITY (no site da Pump existem do 10 ao 38)
    ...Array.from({ length: 29 }, (_, i) => `https://piugame.com/l_img/pumbility/pumbility_${i + 10}.png`).filter((u) => !u.endsWith('_37.png')),
  ];
}
export const plateImgUrl = (plate) => (plate ? `${IMG}/plate/${plate.toLowerCase()}.png` : null);

/** Bolinha de nível no estilo do jogo (single vermelho, double verde, half-double azul, co-op amarelo). */
export function Ball({ chart, size = 'md' }) {
  const kind = chart.mode === 'S' ? 's' : chart.mode === 'D' ? 'd' : chart.mode === 'HD' ? 'hd' : 'c';
  const digits = String(chart.level).split('');
  return (
    <span className={`ball ${size}`} title={chartLabel(chart)} style={{ backgroundImage: `url(${img(`${IMG}/stepball/full/${kind}_bg.png`)})` }}>
      <img className="ball-text" src={img(`${IMG}/stepball/full/${kind}_text.png`)} {...imgProps} />
      <span className="ball-num">
        {kind === 'c' && <b className="ball-x">×</b>}
        {digits.map((d, i) => <img key={i} src={img(`${IMG}/stepball/full/s_num_${d}.png`)} {...imgProps} />)}
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
  return <img className={`grade-img ${size}`} src={img(`${IMG}/grade/${code}.png`)} title={broken ? `${grade} (stage break)` : grade} {...imgProps} alt={grade} />;
}

export function Plate({ plate, size = 'md' }) {
  if (!plate) return null;
  return <img className={`plate-img ${size}`} src={img(`${IMG}/plate/${plate.toLowerCase()}.png`)} title={PLATES[plate] || plate} {...imgProps} alt={plate} />;
}

/** Capa da música (banner 16:9 do jogo) ou um placeholder com as iniciais. */
export function Jacket({ song, width = 96, className = '' }) {
  const initials = (song.title || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hue = [...(song.title || '')].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) % 360, 7);
  // 0 carregando, 1 ok, 2 falhou (tenta de novo uma vez; se falhar de novo fica a capa com as iniciais, sem o ícone de imagem quebrada)
  const [st, setSt] = useState(0);
  const [retry, setRetry] = useState(0);
  // 1ª tentativa: arquivo salvo no aparelho (se houver); se falhar, a imagem da Pump
  const remote = remoteImg(song.jacket);
  const src = song.jacket && (retry ? `${remote}${remote.includes('?') ? '&' : '?'}r=${retry}` : img(song.jacket));
  const fail = () => { if (retry < 1) setTimeout(() => setRetry((r) => r + 1), 1200); else setSt(2); };
  return (
    <div className={`jacket ${className} ${src && st === 0 ? 'loading' : ''}`} style={{ width, '--hue': hue }}>
      {(!src || st !== 1) && <span>{initials}</span>}
      {src && st !== 2 && <img key={retry} src={src} {...imgProps} className={st === 1 ? 'on' : ''} onLoad={() => setSt(1)} onError={fail} />}
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

const MODE_ORDER = ['S', 'D', 'HD', 'C'];
const MODE_TAG = { S: 'S', D: 'D', HD: 'HD', C: 'Co-op' };

/** Linha da lista de músicas: os níveis vêm agrupados por modo e cada um abre o próprio chart. */
export function SongRow({ song, filter, legacy }) {
  const charts = filter ? song.charts.filter(filter) : song.charts;
  const groups = MODE_ORDER.map((m) => [m, charts.filter((c) => c.mode === m)]).filter(([, cs]) => cs.length);
  return (
    <div className="songrow">
      <Link to={`/musica/${song.id}`} className="songrow-link" aria-label={song.title} />
      <Jacket song={song} width={92} />
      <div className="songrow-main">
        <div className="title">{song.title}{(song.rise || song.hasHD) && <RiseBadge small full={song.rise} />}</div>
        <div className="sub">{song.artist || '—'}{song.bpm ? ` · ${fmtBpm(song.bpm)} BPM` : ''}</div>
        <div className="pips">
          {groups.map(([m, cs]) => (
            <span key={m} className={`pip-grp g-${m}`}>
              <em>{MODE_TAG[m]}</em>
              {cs.map((c) => (
                <Link key={c.id} to={`/chart/${c.id}`} className="pip-link"><ChartPip chart={c} legacy={legacy ? legacy(c) : null} /></Link>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Legenda das bolinhas de nível da lista de músicas. */
export function PipLegend({ legacy }) {
  const ex = (mode, extra = '', label) => (
    <span className="pl-item"><span className={`pip ${mode} ${extra}`}>20</span>{label}</span>
  );
  return (
    <div className="pip-legend">
      {ex('single', 't-a', t('Passou'))}
      {ex('single', 't-s', t('S ou melhor'))}
      {ex('single', 't-a broken', t('Quebrou'))}
      {ex('single', 't-none', t('Não jogou'))}
      {legacy && ex('single', 't-a legacy', t('Recorde da Phoenix (P1)'))}
      <p className="muted small">{t('S = Single, D = Double. Toque num nível para abrir o chart.')}</p>
    </div>
  );
}

/** Cartão no estilo "My Best Score" do site: capa ao fundo, bolinha, grade, score e plate. */
export function ScoreCard({ chart, score, grade, plate, broken, date, to, extra }) {
  const body = (
    <>
      <div className="sc-bg" style={chart.song.jacket ? { backgroundImage: `url(${img(chart.song.jacket)})` } : undefined} />
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

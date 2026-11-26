// Músicas mais jogadas pela pessoa, a partir das jogadas sincronizadas (o piugame guarda só as 50 últimas,
// então a contagem vale desde que a pessoa começou a sincronizar).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ball, Grade, Jacket } from './ui.jsx';
import { gradeRank } from '../lib/piu.js';
import { Chips } from '../pages/Songs.jsx';
import { fmtNum, locale, t, tn } from '../lib/i18n.js';

const DAY = 86400000;
const PERIODS = { 30: 30 * DAY, 90: 90 * DAY, all: Infinity };

export function topSongs(plays, mode, period = 'all', now = Date.now()) {
  const lim = PERIODS[period] ?? Infinity;
  const by = new Map();
  for (const p of plays) {
    if (p.chart.mode !== mode || now - p.at > lim) continue;
    const s = p.chart.song;
    if (!by.has(s.id)) by.set(s.id, { song: s, plays: 0, passes: 0, last: 0, charts: new Map() });
    const e = by.get(s.id);
    e.plays++; if (!p.broken) e.passes++;
    e.last = Math.max(e.last, p.at);
    const c = e.charts.get(p.chart.id) || { chart: p.chart, n: 0 };
    c.n++; e.charts.set(p.chart.id, c);
  }
  return [...by.values()].map((e) => {
    const charts = [...e.charts.values()].sort((a, b) => b.n - a.n || a.chart.level - b.chart.level);
    const best = charts.map((c) => c.chart).filter((c) => c.grade)
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || b.level - a.level)[0] || null;
    return { ...e, charts, best };
  }).sort((a, b) => b.plays - a.plays || b.last - a.last);
}

export default function TopPlayed({ plays, mode }) {
  const [period, setPeriod] = useState('all');
  const list = useMemo(() => topSongs(plays, mode, period), [plays, mode, period]);
  const top = list.slice(0, 15);
  const max = top[0]?.plays || 1;
  const total = list.reduce((s, e) => s + e.plays, 0);
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(locale(), { day: '2-digit', month: 'short' });

  return (
    <section className="card top-played">
      <div className="tp-head">
        <h3>{t('Músicas mais jogadas')}</h3>
        <Chips value={period} onChange={setPeriod} options={[['30', t('30 dias')], ['90', t('90 dias')], ['all', t('Tudo')]]} />
      </div>
      {!top.length
        ? <p className="empty">{t('Nenhuma jogada neste período. Sincronize depois de jogar para ver suas músicas favoritas.')}</p>
        : (
          <>
            <p className="muted small">{tn(total, '{n} jogada em {k} músicas', '{n} jogadas em {k} músicas', { n: fmtNum(total), k: fmtNum(list.length) })}</p>
            <ol className="tp-list">
              {top.map((e, i) => (
                <li key={e.song.id}>
                  <Link to={`/musica/${e.song.id}`} className="tp-row">
                    <span className="tp-rank">{i + 1}</span>
                    <Jacket song={e.song} width={44} />
                    <div className="tp-main">
                      <div className="tp-title">{e.song.title}</div>
                      <div className="tp-bar"><span style={{ width: `${(e.plays / max) * 100}%` }} /></div>
                      <div className="tp-charts">
                        {e.charts.slice(0, 4).map((c) => (
                          <span key={c.chart.id} className="tp-chart"><Ball chart={c.chart} size="sm" />{c.n > 1 && <small>×{c.n}</small>}</span>
                        ))}
                        <small className="muted">{t('última: {d}', { d: fmtDate(e.last) })}</small>
                      </div>
                    </div>
                    <div className="tp-side">
                      <b>{fmtNum(e.plays)}</b>
                      <small className="muted">{tn(e.plays, 'jogada', 'jogadas')}</small>
                      {e.best && <Grade grade={e.best.grade} broken={e.best.broken} size="sm" />}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      <p className="muted tiny">{t('Conta as jogadas desde que você começou a sincronizar: o site da Pump guarda só as 50 últimas.')}</p>
    </section>
  );
}

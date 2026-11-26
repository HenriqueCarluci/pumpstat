// Gráficos simples em SVG para a tela Progresso: linha (com cruz e tooltip) e barras empilhadas (tooltip por barra).
// Cores categóricas validadas para o fundo escuro (azul/laranja passam no teste de daltonismo); texto sempre na cor de texto.
import { useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n.js';

export const SERIES = { a: '#3d8fe6', b: '#d9772e', gold: '#ffd23f' };

const W = 640, H = 200, PAD = { l: 44, r: 12, t: 12, b: 26 };

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** Linha única ao longo do tempo. points: [{ x: ms, y }]. */
export function LineChart({ points, color = SERIES.gold, fmtY = (v) => v, fmtX, label, step = false }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const geo = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const sx = (x) => PAD.l + (x1 === x0 ? (W - PAD.l - PAD.r) / 2 : ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r));
    const sy = (y) => PAD.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
    let d = '';
    points.forEach((p, i) => {
      if (i === 0) d += `M${sx(p.x)},${sy(p.y)}`;
      else if (step) d += `H${sx(p.x)}V${sy(p.y)}`;
      else d += `L${sx(p.x)},${sy(p.y)}`;
    });
    return { sx, sy, ticks, d, x0, x1 };
  }, [points, step]);
  if (!geo) return null;

  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(geo.sx(p.x) - x) < Math.abs(geo.sx(points[best].x) - x)) best = i; });
    setHover(best);
  };
  const hp = hover != null ? points[hover] : null;
  const xLabels = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].filter((p, i, a) => a.indexOf(p) === i);

  return (
    <figure className="mchart" aria-label={label}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.sy(v)} y2={geo.sy(v)} className="grid" />
            <text x={PAD.l - 6} y={geo.sy(v) + 4} className="axis" textAnchor="end">{fmtY(v)}</text>
          </g>
        ))}
        {xLabels.map((p) => (
          <text key={p.x} x={geo.sx(p.x)} y={H - 6} className="axis" textAnchor={p === points[0] ? 'start' : p === points[points.length - 1] ? 'end' : 'middle'}>{fmtX(p.x)}</text>
        ))}
        <path d={geo.d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 24 && points.map((p) => <circle key={p.x} cx={geo.sx(p.x)} cy={geo.sy(p.y)} r="4" fill={color} className="dot" />)}
        {hp && (
          <g>
            <line x1={geo.sx(hp.x)} x2={geo.sx(hp.x)} y1={PAD.t} y2={H - PAD.b} className="cross" />
            <circle cx={geo.sx(hp.x)} cy={geo.sy(hp.y)} r="5" fill={color} className="dot" />
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent" />
      </svg>
      {hp && (
        <div className="mchart-tip" style={{ left: `${(geo.sx(hp.x) / W) * 100}%` }}>
          <b>{fmtY(hp.y)}</b><span>{fmtX(hp.x)}</span>{hp.note && <span>{hp.note}</span>}
        </div>
      )}
    </figure>
  );
}

/**
 * Barras empilhadas. bars: [{ key, label, parts: [v1, v2], note }]; series: [{ name, color }].
 * Com 2+ séries mostra a legenda.
 */
export function StackedBars({ bars, series, fmtV = (v) => v, label }) {
  const [hover, setHover] = useState(null);
  if (!bars.length) return null;
  const max = Math.max(1, ...bars.map((b) => b.parts.reduce((a, v) => a + v, 0)));
  const ticks = niceTicks(0, max, 3);
  const top = ticks[ticks.length - 1];
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const bw = Math.min(36, (iw / bars.length) * 0.7);
  const gap = iw / bars.length;
  const sy = (v) => PAD.t + ih - (v / top) * ih;
  const hb = hover != null ? bars[hover] : null;
  const every = Math.ceil(bars.length / 12);

  return (
    <figure className="mchart" aria-label={label}>
      {series.length > 1 && (
        <div className="mchart-legend">
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} /> {s.name}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={PAD.l - 6} y={sy(v) + 4} className="axis" textAnchor="end">{fmtV(v)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = PAD.l + gap * i + gap / 2;
          let acc = 0;
          return (
            <g key={b.key} className={hover === i ? 'bar on' : 'bar'} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={PAD.l + gap * i} y={PAD.t} width={gap} height={ih} fill="transparent" />
              {b.parts.map((v, k) => {
                if (!v) return null;
                const y1 = sy(acc), y2 = sy(acc + v);
                acc += v;
                const h = Math.max(1, y1 - y2 - 2); // 2px de respiro entre segmentos
                return <rect key={k} x={cx - bw / 2} y={y2} width={bw} height={h} rx="3" fill={series[k].color} />;
              })}
              {i % every === 0 && <text x={cx} y={H - 6} className="axis" textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
      </svg>
      {hb && (
        <div className="mchart-tip" style={{ left: `${((PAD.l + gap * hover + gap / 2) / W) * 100}%` }}>
          <b>{hb.label}</b>
          {series.map((s, k) => <span key={s.name}><i style={{ background: s.color }} /> {s.name}: {fmtV(hb.parts[k])}</span>)}
          {hb.note && <span>{hb.note}</span>}
        </div>
      )}
    </figure>
  );
}

/** Tabela com os mesmos dados do gráfico (acessibilidade). */
export function ChartTable({ head, rows }) {
  return (
    <details className="mchart-table">
      <summary>{t('Ver em tabela')}</summary>
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

// Gráficos simples em SVG para a tela Progresso: linha (com cruz e tooltip) e barras empilhadas (tooltip por barra).
// Cores categóricas validadas para o fundo escuro (azul/laranja passam no teste de daltonismo); texto sempre na cor de texto.
import { useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n.js';
import { ChevronRight } from './Icons.jsx';

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
export function LineChart({ points, color = SERIES.gold, fmtY = (v) => v, fmtX, label, step = false, minSpan = 0 }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const geo = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    // faixa mínima: evita eixo com rótulos repetidos quando a linha quase não muda
    if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    const ticks = niceTicks(lo, hi);
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
        {geo.ticks.filter((v, i, a) => i === 0 || fmtY(v) !== fmtY(a[i - 1])).map((v) => (
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

/**
 * Gráfico de setor (rosca). slices: [{ key, name, value, color }]. Mostra % em cada fatia grande,
 * legenda com valores e tooltip ao passar o dedo/mouse.
 */
/** onPick(slice): se vier, tocar numa fatia ou num item da legenda abre o detalhe daquela fatia. */
export function Donut({ slices, label, center, fmtV = (v) => v, onPick = null }) {
  const [hover, setHover] = useState(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return null;
  const R = 80, r = 50, C = 100;
  let a0 = -Math.PI / 2;
  const arcs = slices.filter((s) => s.value > 0).map((s) => {
    const frac = s.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const gap = slices.length > 1 ? 0.012 : 0; // respiro de ~2px entre fatias
    const s0 = a0 + gap, s1 = a1 - gap;
    const large = s1 - s0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    const d = frac >= 0.999
      ? `M${C - R},${C}A${R},${R} 0 1 1 ${C + R},${C}A${R},${R} 0 1 1 ${C - R},${C}M${C - r},${C}A${r},${r} 0 1 0 ${C + r},${C}A${r},${r} 0 1 0 ${C - r},${C}Z`
      : `M${p(R, s0)}A${R},${R} 0 ${large} 1 ${p(R, s1)}L${p(r, s1)}A${r},${r} 0 ${large} 0 ${p(r, s0)}Z`;
    const mid = (a0 + a1) / 2;
    const out = { ...s, d, frac, lx: C + ((R + r) / 2) * Math.cos(mid), ly: C + ((R + r) / 2) * Math.sin(mid) };
    a0 = a1;
    return out;
  });
  const hs = hover != null ? arcs[hover] : null;
  return (
    <figure className="donut" aria-label={label}>
      <svg viewBox="0 0 200 200" role="img" onPointerLeave={() => setHover(null)}>
        {arcs.map((s, i) => (
          <path key={s.key} d={s.d} fill={s.color} className={`${hover === i ? 'on' : ''}${onPick ? ' pick' : ''}`} onPointerEnter={() => setHover(i)}
            onClick={() => { setHover(i); onPick?.(s); }} />
        ))}
        {arcs.map((s) => s.frac >= 0.08 && (
          <text key={`t${s.key}`} x={s.lx} y={s.ly + 4} textAnchor="middle" className="donut-pct">{Math.round(s.frac * 100)}%</text>
        ))}
        <text x={C} y={C - 2} textAnchor="middle" className="donut-c1">{hs ? `${Math.round(hs.frac * 100)}%` : center?.[0]}</text>
        <text x={C} y={C + 16} textAnchor="middle" className="donut-c2">{hs ? hs.name : center?.[1]}</text>
      </svg>
      <ul className="donut-legend">
        {arcs.map((s, i) => (
          <li key={s.key} className={`${hover === i ? 'on' : ''}${onPick ? ' pickable' : ''}`} onPointerEnter={() => setHover(i)}>
            {onPick ? (
              <button type="button" className="donut-pick" onClick={() => onPick(s)}>
                <i style={{ background: s.color }} /> <span>{s.name}</span> <b>{fmtV(s.value)}</b><ChevronRight size={14} className="muted" />
              </button>
            ) : <><i style={{ background: s.color }} /> <span>{s.name}</span> <b>{fmtV(s.value)}</b></>}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Barras lado a lado (você x outra pessoa). bars: [{ key, label, values: [a, b] }]; series: [{ name, color }]. */
export function GroupedBars({ bars, series, fmtV = (v) => v, label }) {
  const [hover, setHover] = useState(null);
  if (!bars.length) return null;
  const max = Math.max(1, ...bars.flatMap((b) => b.values));
  const ticks = niceTicks(0, max, 3);
  const top = ticks[ticks.length - 1];
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const gap = iw / bars.length;
  const bw = Math.min(16, (gap * 0.8) / series.length);
  const sy = (v) => PAD.t + ih - (v / top) * ih;
  const hb = hover != null ? bars[hover] : null;
  const every = Math.ceil(bars.length / 14);
  return (
    <figure className="mchart" aria-label={label}>
      <div className="mchart-legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} /> {s.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={PAD.l - 6} y={sy(v) + 4} className="axis" textAnchor="end">{fmtV(v)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = PAD.l + gap * i + gap / 2;
          const x0 = cx - (bw * series.length + 2 * (series.length - 1)) / 2;
          return (
            <g key={b.key} className={hover === i ? 'bar on' : 'bar'} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={PAD.l + gap * i} y={PAD.t} width={gap} height={ih} fill="transparent" />
              {b.values.map((v, k) => v > 0 && (
                <rect key={k} x={x0 + k * (bw + 2)} y={sy(v)} width={bw} height={Math.max(1, sy(0) - sy(v))} rx="3" fill={series[k].color} />
              ))}
              {i % every === 0 && <text x={cx} y={H - 6} className="axis" textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
      </svg>
      {hb && (
        <div className="mchart-tip" style={{ left: `${((PAD.l + gap * hover + gap / 2) / W) * 100}%` }}>
          <b>{hb.label}</b>
          {series.map((s, k) => <span key={s.name}><i style={{ background: s.color }} /> {s.name}: {fmtV(hb.values[k])}</span>)}
        </div>
      )}
    </figure>
  );
}

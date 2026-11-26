import { STYLE_KEYS, tagPt } from '../lib/style.js';

/** Barras com o % de notas em cada padrão do chart. */
export default function StyleBars({ style, compact = false }) {
  if (!style) return null;
  const keys = STYLE_KEYS.filter((k) => !compact || style.pct[k.id] >= 3);
  return (
    <div className={`stylebars ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="sb-head">
          <span>Estilo do chart</span>
          <span className="muted small">
            {style.nps != null && <>{style.nps} notas/s</>}{style.bpmInfo && <> · {style.bpmInfo.replace('notes', 'notas')}</>}
          </span>
        </div>
      )}
      {keys.map((k) => {
        const v = style.pct[k.id] || 0;
        return (
          <div key={k.id} className="sb-row" title={k.tip}>
            <span className="sb-l">{k.label}</span>
            <span className="sb-track"><span className="sb-fill" style={{ width: `${Math.min(100, v)}%`, background: k.color }} /></span>
            <span className="sb-v">{Math.round(v)}%</span>
          </div>
        );
      })}
      {!compact && style.tags?.length > 0 && (
        <div className="sb-tags">Destaques: {style.tags.map((t) => <span key={t} className="tag skill">{tagPt(t)}</span>)}</div>
      )}
      {!compact && <div className="muted tiny">% das notas em cada padrão. Um passo pode contar em mais de um. Fonte: anotações do piucenter.com.</div>}
    </div>
  );
}

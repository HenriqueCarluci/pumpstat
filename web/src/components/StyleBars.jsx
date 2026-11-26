import { STYLE_KEYS, tagPt } from '../lib/style.js';
import { t } from '../lib/i18n.js';

/** Barras com o % de notas em cada padrão do chart. */
export default function StyleBars({ style, compact = false }) {
  if (!style) return null;
  const keys = STYLE_KEYS.filter((k) => !compact || style.pct[k.id] >= 3);
  return (
    <div className={`stylebars ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="sb-head">
          <span>{t('Estilo do chart')}</span>
          <span className="muted small">
            {style.nps != null && <>{t('{n} notas/s', { n: style.nps })}</>}{style.bpmInfo && <> · {style.bpmInfo}</>}
          </span>
        </div>
      )}
      {keys.map((k) => {
        const v = style.pct[k.id] || 0;
        return (
          <div key={k.id} className="sb-row" title={t(k.tip)}>
            <span className="sb-l">{t(k.label)}</span>
            <span className="sb-track"><span className="sb-fill" style={{ width: `${Math.min(100, v)}%`, background: k.color }} /></span>
            <span className="sb-v">{Math.round(v)}%</span>
          </div>
        );
      })}
      {!compact && style.tags?.length > 0 && (
        <div className="sb-tags">{t('Destaques:')} {style.tags.map((x) => <span key={x} className="tag skill">{t(tagPt(x))}</span>)}</div>
      )}
      {!compact && <div className="muted tiny">{t('% das notas em cada padrão. Um passo pode contar em mais de um. Fonte: anotações do piucenter.com.')}</div>}
    </div>
  );
}

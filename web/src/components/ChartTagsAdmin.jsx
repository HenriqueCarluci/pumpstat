import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { CHART_TAGS, chartTagLabel, tagColor } from '../lib/tags.js';
import { t, tErr } from '../lib/i18n.js';
import { X } from './Icons.jsx';

/**
 * Editor da equipe (curadoria/admin) para as tags de um chart: muda o peso, tira ou põe tags.
 * O ajuste fica por cima da base do ArcadeStat e não se perde quando a base é atualizada.
 */
export default function ChartTagsAdmin({ chart: c, onSaved, onClose }) {
  const [rows, setRows] = useState(() => (c.tagBars || []).map(([x, v]) => [x, v]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const missing = CHART_TAGS.filter(([x]) => !rows.some(([y]) => y === x));
  const setV = (i, v) => setRows((r) => r.map((row, j) => (j === i ? [row[0], Math.max(1, Math.min(100, Number(v) || 1))] : row)));
  const save = async (tags) => {
    setBusy(true); setErr('');
    try { await rpc('admin_set_chart_tags', { p_chart: c.id, p_tags: tags }); await onSaved?.(); onClose?.(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  return (
    <div className="tag-admin">
      <p className="tiny muted">{t('Ajuste da equipe: fica por cima dos votos do ArcadeStat e continua valendo quando a base for atualizada.')}</p>
      {rows.map(([x, v], i) => (
        <div key={x} className="tag-admin-row">
          <span className="ta-name" style={{ '--c': tagColor(x) }}>{t(chartTagLabel(x))}</span>
          <input type="range" min={1} max={100} value={v} onChange={(e) => setV(i, e.target.value)} aria-label={t(chartTagLabel(x))} />
          <input type="number" min={1} max={100} value={v} onChange={(e) => setV(i, e.target.value)} />
          <button type="button" className="icon-btn" title={t('Tirar a tag')} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}><X size={14} /></button>
        </div>
      ))}
      {missing.length > 0 && (
        <select value="" onChange={(e) => e.target.value && setRows((r) => [...r, [e.target.value, 50]])}>
          <option value="">{t('+ Adicionar tag')}</option>
          {missing.map(([x]) => <option key={x} value={x}>{t(chartTagLabel(x))}</option>)}
        </select>
      )}
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" disabled={busy} onClick={() => save(Object.fromEntries(rows))}>{t('Salvar')}</button>
        <button className="btn ghost" disabled={busy} onClick={onClose}>{t('Cancelar')}</button>
        {c.tagsEdited && <button className="btn ghost" disabled={busy} onClick={() => window.confirm(t('Desfazer o ajuste e voltar para as tags do ArcadeStat?')) && save(null)}>{t('Voltar ao ArcadeStat')}</button>}
      </div>
    </div>
  );
}

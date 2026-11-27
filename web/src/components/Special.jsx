import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { GIMMICK_LABEL, GIMMICKS, hasGimmick, isOffCurve } from '../lib/special.js';
import { t, tErr } from '../lib/i18n.js';
import { Check, Zap, Shuffle } from './Icons.jsx';

/** Selos de chart Unique: gimmick (com os tipos) e fora da curva. */
export function SpecialBadges({ chart: c, compact = false, gimmick = true }) {
  if (!(gimmick && hasGimmick(c)) && !isOffCurve(c) && !(!compact && c.special?.note)) return null;
  const types = (c.special.g || []).map((g) => t(GIMMICK_LABEL[g] || g));
  return (
    <>
      {gimmick && hasGimmick(c) && (
        <span className="tag special gimmick" title={types.join(' · ') || t('Gimmick')}>
          <Zap size={12} /> {t('Gimmick')}{!compact && types.length > 0 && `: ${types.join(' · ')}`}
        </span>
      )}
      {isOffCurve(c) && <span className="tag special off" title={t('Steps muito diferentes do normal para o nível')}><Shuffle size={12} /> {t('Fora da curva')}</span>}
      {!compact && c.special.note && <span className="tag special note">{c.special.note}</span>}
    </>
  );
}

/** Editor do admin: marca o gimmick por tipo, "fora da curva" e uma observação. */
export function SpecialAdmin({ chart: c, onSaved }) {
  const sp = c.special || {};
  const [g, setG] = useState(sp.admin ? sp.g || [] : []);
  const [off, setOff] = useState(sp.admin ? !!sp.off : false);
  const [note, setNote] = useState(sp.note || '');
  const [msg, setMsg] = useState('');
  const flip = (x) => setG((v) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]));
  const save = async () => {
    setMsg('');
    try { await rpc('admin_set_chart_flags', { p_chart: c.id, p_gimmicks: g, p_special: off, p_note: note }); setMsg(t('Salvo')); onSaved?.(); } catch (e) { setMsg(tErr(e.message)); }
  };
  return (
    <details className="special-admin">
      <summary className="small">{t('Gimmick e fora da curva')}</summary>
      <div className="chips">
        {GIMMICKS.map(([x, l]) => <button key={x} type="button" className={g.includes(x) ? 'on' : ''} onClick={() => flip(x)}>{t(l)}</button>)}
      </div>
      <label className="check small"><input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> {t('Fora da curva (steps muito diferentes para o nível)')}</label>
      <input type="text" maxLength={200} placeholder={t('Observação (opcional)')} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="bm-row">
        <button className="btn" type="button" onClick={save}>{t('Salvar')}</button>
        {msg && <span className="muted small ic-row">{msg === t('Salvo') && <Check size={14} />} {msg}</span>}
      </div>
      <p className="muted tiny">{t('A marcação do admin vale na hora. A comunidade também marca nas avaliações: com 2 votos o chart entra em Unique.')}</p>
    </details>
  );
}

import { useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { countryOptions, Flag, guessCountry, setCachedCountry } from '../lib/country.jsx';
import { t, tErr } from '../lib/i18n.js';
import { Check } from './Icons.jsx';

/** Ajustes: país do jogador (bandeira no perfil). Opcional. */
export default function CountryPicker() {
  const { session } = useData();
  const [cc, setCc] = useState(undefined);
  const [msg, setMsg] = useState('');
  useEffect(() => { rpc('my_country').then((r) => setCc(r || '')).catch(() => setCc('')); }, []);
  if (cc === undefined) return null;
  const guess = guessCountry();
  const save = async (v) => {
    setMsg(''); setCc(v);
    try { const r = await rpc('set_my_country', { p_cc: v || null }); setCachedCountry(session?.user?.id, r); setMsg(t('Salvo')); } catch (e) { setMsg(tErr(e.message)); }
  };
  return (
    <section className="card country-pick">
      <h3 className="ic-row">{cc ? <Flag cc={cc} size={18} /> : null} {t('País')}</h3>
      <p className="muted small">{t('A bandeira aparece ao lado do seu nick para os outros jogadores. Opcional.')}</p>
      <div className="bm-row">
        <select value={cc} onChange={(e) => save(e.target.value)} aria-label={t('País')}>
          <option value="">{t('Não mostrar')}</option>
          {guess && <option value={guess}>{`★ ${countryOptions().find(([k]) => k === guess)?.[1] || guess}`}</option>}
          {countryOptions().map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
        {msg && <span className="muted small ic-row">{msg === t('Salvo') && <Check size={14} />} {msg}</span>}
      </div>
    </section>
  );
}

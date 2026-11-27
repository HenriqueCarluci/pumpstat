import { useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import { downloadJackets, jacketMode, jacketModeChosen, jacketsRunning, jacketUrls, pendingJackets, setJacketMode, stopJackets } from '../lib/jacketCache.js';
import { t } from '../lib/i18n.js';
import { isNative } from '../lib/native.js';
import { ImagePlus } from './Icons.jsx';
import { Chips } from '../pages/Songs.jsx';

/**
 * Só no app: escolher se as capas das músicas baixam conforme aparecem ou todas de uma vez.
 * Na Início aparece uma vez (até a pessoa escolher); em Ajustes fica sempre.
 */
export default function JacketCacheCard({ where = 'settings' }) {
  const { data } = useData();
  const [mode, setMode] = useState(jacketMode);
  const [chosen, setChosen] = useState(jacketModeChosen);
  const [prog, setProg] = useState(null);
  const total = jacketUrls(data).length;
  const pending = data ? pendingJackets(data).length : 0;
  useEffect(() => { if (jacketsRunning()) downloadJackets(data, (n, tot) => setProg([n, tot])).then(() => setProg(null)); }, []); // eslint-disable-line
  if (!isNative || !data || (where === 'home' && chosen)) return null;

  const pick = (m) => {
    setJacketMode(m); setMode(m); setChosen(true);
    if (m === 'all') downloadJackets(data, (n, tot) => setProg([n, tot])).then(() => setProg(null));
    else stopJackets();
  };
  const left = prog ? prog[1] - prog[0] : pending;
  return (
    <section className="card jcache">
      <h3 className="ic-row"><ImagePlus size={18} /> {t('Capas das músicas')}</h3>
      <p className="small muted">{t('Baixar todas deixa a lista de músicas e o Tier com as capas prontas, mesmo com internet ruim. Usa alguns MB de dados (melhor no Wi-Fi).')}</p>
      {where === 'home' && !chosen ? (
        <div className="card-actions">
          <button className="btn" onClick={() => pick('all')}>{t('Baixar todas agora')}</button>
          <button className="btn ghost" onClick={() => pick('lazy')}>{t('Conforme aparecem')}</button>
        </div>
      ) : (
        <Chips value={mode} onChange={pick} options={[['lazy', t('Conforme aparecem')], ['all', t('Baixar todas')]]} />
      )}
      {mode === 'all' && (prog ? (
        <div className="jcache-prog">
          <div className="jcache-bar"><span style={{ width: `${prog[1] ? Math.round((prog[0] / prog[1]) * 100) : 100}%` }} /></div>
          <small className="muted">{t('Baixando capas: {n} de {t}', { n: prog[0], t: prog[1] })}</small>
        </div>
      ) : (
        <small className="muted">{left ? t('Faltam {n} capas. Elas baixam sozinhas quando o app abre.', { n: left }) : t('Todas as {n} capas já estão no aparelho.', { n: total })}</small>
      ))}
    </section>
  );
}

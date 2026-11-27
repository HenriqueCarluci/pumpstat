// Modo visitante: app sem login, só com o Tier e a página do chart (tier e tags). Nada de notas, perfil ou social.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { DataCtx } from '../App.jsx';
import { fetchGuest, rpc } from '../lib/api.js';
import { setGuest } from '../lib/guest.js';
import { VERSIONS } from '../lib/piu.js';
import { t, tErr } from '../lib/i18n.js';
import { Logo } from './Icons.jsx';
import Tier from '../pages/Tier.jsx';
import GuestChart from '../pages/GuestChart.jsx';

const VKEY = 'pumpstat:guest-version';

export default function GuestApp() {
  const [version, setV] = useState(() => { try { return localStorage.getItem(VKEY) || 'phoenix2'; } catch { return 'phoenix2'; } });
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    fetchGuest(version).then(setData).catch((e) => setError(tErr(e.message)));
  }, [version]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { rpc('app_config').then(setConfig).catch(() => setConfig({})); }, []);
  const setVersion = (v) => { try { localStorage.setItem(VKEY, v); } catch { /* ignora */ } setV(v); };
  const ctx = useMemo(() => ({
    version, setVersion, data, reload: load, guest: true,
    plan: { plan: 'free', guest: true, config: { ...(config || {}), toggles: { ...(config?.toggles || {}), tier_votes: false, training: false } } },
    reloadPlan: async () => null, session: null,
    notifications: { items: [], unread: 0, markSeen: () => {}, markAll: () => {} }, presence: {},
  }), [version, data, load, config]);
  const exit = () => setGuest(false);

  return (
    <DataCtx.Provider value={ctx}>
      <HashRouter>
        <div className="app guest-app">
          <header className="topbar">
            <Link to="/" className="brand"><Logo /> <span className="brand-text">PIU Stats</span></Link>
            <div className="seg" role="tablist" aria-label={t('Versão')}>
              {Object.values(VERSIONS).map((v) => (
                <button key={v.id} className={v.id === version ? 'on' : ''} onClick={() => setVersion(v.id)}>{v.name}</button>
              ))}
            </div>
          </header>
          <div className="guest-banner">
            <span>{t('Você está como visitante: só o tier e as tags dos charts.')}</span>
            <button type="button" className="btn sm" onClick={exit}>{t('Entrar ou criar conta')}</button>
          </div>
          {error && (
            <div className="banner err">{error} <button onClick={exit}>{t('Voltar para o login')}</button></div>
          )}
          <main className="content">
            {!data ? <div className="empty">{error ? '' : t('Carregando…')}</div> : (
              <Routes>
                <Route path="/chart/:id" element={<GuestChart />} />
                <Route path="*" element={<Tier />} />
              </Routes>
            )}
          </main>
        </div>
      </HashRouter>
    </DataCtx.Provider>
  );
}

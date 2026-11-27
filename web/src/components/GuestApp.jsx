// Modo visitante: app sem login, só com o Tier e a página do chart (tier e tags). Nada de notas, perfil ou social.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import AdSlot from './AdSlot.jsx';
import { DataCtx } from '../App.jsx';
import { fetchGuest, rpc } from '../lib/api.js';
import { setGuest } from '../lib/guest.js';
import { VERSIONS } from '../lib/piu.js';
import { t, tErr } from '../lib/i18n.js';
import { Logo, X } from './Icons.jsx';
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
                <Route path="/entrar" element={<Leave />} />
                <Route path="*" element={<Tier />} />
              </Routes>
            )}
          </main>
          {data && config && <GuestAd config={config} />}
        </div>
      </HashRouter>
    </DataCtx.Provider>
  );
}

function Leave() {
  useEffect(() => { setGuest(false); }, []);
  return <Navigate to="/" replace />;
}

const AD_KEY = 'pumpstat:guest-ad-at';
const lastAd = () => { try { return Number(localStorage.getItem(AD_KEY)) || 0; } catch { return 0; } };

/**
 * Visitante: um anúncio em tela cheia ao abrir e de novo a cada N minutos (padrão 60), configurável no admin.
 * Fecha depois de alguns segundos. Sem anúncio próprio ativo, mostra o convite para criar a conta.
 */
function GuestAd({ config }) {
  const g = config?.guest || {};
  const every = Math.max(5, Number(g.ad_every_min) || 60) * 60000;
  const [open, setOpen] = useState(() => g.ad_on_open !== false);
  const [wait, setWait] = useState(5);
  useEffect(() => {
    const id = setInterval(() => { if (!open && Date.now() - lastAd() >= every) setOpen(true); }, 30000);
    return () => clearInterval(id);
  }, [open, every]);
  useEffect(() => {
    if (!open) return undefined;
    try { localStorage.setItem(AD_KEY, String(Date.now())); } catch { /* ignora */ }
    setWait(5);
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [open]);
  if (!open) return null;
  const fallback = { id: 'signup', title: t('Crie sua conta grátis'), text: t('Sincronize suas notas da Pump, veja seu PUMBILITY, missões da semana e entre na fila do fliperama.'), cta: t('Criar conta'), url: '#/entrar' };
  return (
    <div className="guest-ad" role="dialog" aria-modal="true" aria-label={t('Anúncio')}>
      <div className="guest-ad-box">
        <div className="guest-ad-top">
          <span className="muted small">{t('Visitantes veem anúncios. Com conta, o PIU Stats é grátis e tem muito mais.')}</span>
          <button type="button" className="icon-btn" disabled={wait > 0} onClick={() => setOpen(false)} aria-label={t('Fechar')}>
            {wait > 0 ? <span className="guest-ad-wait">{wait}</span> : <X size={18} />}
          </button>
        </div>
        <AdSlot place="guest" force fallback={fallback} />
      </div>
    </div>
  );
}

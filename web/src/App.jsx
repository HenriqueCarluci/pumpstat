import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { cachedVersion, clearCache, fetchVersion, rpc } from './lib/api.js';
import { homeBest, withHome } from './lib/homeScores.js';
import { API_URL } from './lib/config.js';
import { getSession, onSession, sessionFromHash, sessionFromUrl, signOut, takeSessionEnded, updatePassword } from './lib/auth.js';
import { initNative, isNative } from './lib/native.js';
import { addImageUrls, downloadJackets, jacketMode } from './lib/jacketCache.js';
import { initImgStore } from './lib/imgStore.js';
import { hasHint, listFactors, rememberHint, sessionAal, verifiedFactor } from './lib/mfa.js';
import { MfaInvite, MfaLogin } from './components/TwoFactor.jsx';
import './lib/topbar.js';
import { VERSIONS } from './lib/piu.js';
import Home from './pages/Home.jsx';
import Songs from './pages/Songs.jsx';
import Song from './pages/Song.jsx';
import Tier from './pages/Tier.jsx';
import Recent from './pages/Recent.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Queue from './pages/Queue.jsx';
import QueueTV from './pages/QueueTV.jsx';
import Venues from './pages/Venues.jsx';
import Titles from './pages/Titles.jsx';
import Players, { ComparePlayer, PlayerProfile } from './pages/Players.jsx';
import Chart from './pages/Chart.jsx';
import Votes from './pages/Votes.jsx';
import Progress from './pages/Progress.jsx';
import Recommend from './pages/Recommend.jsx';
import Notifications from './pages/Notifications.jsx';
import { useNotifications } from './lib/notify.js';
import { usePresence } from './lib/presence.js';
import Online from './pages/Online.jsx';
import InviteToast from './components/InviteToast.jsx';
import FriendOnlineToast from './components/FriendOnlineToast.jsx';
import AdminSignupToast from './components/AdminSignupToast.jsx';
import NotifToast from './components/NotifToast.jsx';
import StatusPicker from './components/StatusPicker.jsx';
import { SearchDialog, Sidebar, useSearchHotkey } from './components/DesktopNav.jsx';
import { useIsDesktop } from './lib/desktop.js';
import { PreviewBanner, ViewAsBanner } from './components/PlanLock.jsx';
import { asPreviewUser, isOn } from './lib/plans.js';
const noop = () => {};
import Admin from './pages/Admin.jsx';
import Plans from './pages/Plans.jsx';
import Subscription from './pages/Subscription.jsx';
import Training from './pages/Training.jsx';
import HomeTraining from './pages/HomeTraining.jsx';
import MyTeam from './pages/MyTeam.jsx';
import DayReport from './pages/DayReport.jsx';
import Tour from './components/Tour.jsx';
import { QuizPrompt } from './components/QuizModal.jsx';
import { initBilling } from './lib/billing.js';
import Privacy from './pages/Privacy.jsx';
import ReleaseNotes from './pages/ReleaseNotes.jsx';
import GuestApp from './components/GuestApp.jsx';
import { isGuest } from './lib/guest.js';
import { t, tErr } from './lib/i18n.js';
import { Bell, HomeIcon, LayoutGrid, ListOrdered, Logo, Music2, Search, SettingsIcon } from './components/Icons.jsx';
import Challenges from './pages/Challenges.jsx';
import DeleteInfo from './pages/DeleteInfo.jsx';

export const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

function readVersion() {
  try { return localStorage.getItem('pumpstat:version') || 'phoenix2'; } catch { return 'phoenix2'; }
}

// Confirmação de e-mail / recuperação de senha chegam com o token na URL
const fromUrl = sessionFromUrl();

export default function App() {
  const [session, setSession] = useState(getSession);
  const [ingestKey, setIngestKey] = useState('');
  const [recovery, setRecovery] = useState(fromUrl?.type === 'recovery');

  useEffect(() => onSession((s) => { setSession(s); if (!s) { setIngestKey(''); clearCache(); } }), []);
  // app nativo: barra de status, botão voltar e volta do login com Google
  useEffect(() => { initNative({ onAuthHash: (h) => { const r = sessionFromHash(h); if (r?.type === 'recovery') setRecovery(true); } }); }, []);
  // sem login, trocar de #/ para #/fila precisa redesenhar (a fila é pública)
  const [, setHash] = useState(window.location.hash);
  useEffect(() => { const f = () => setHash(window.location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  // modo visitante (sem login): entra e sai sem recarregar a página
  const [, setGuestTick] = useState(0);
  useEffect(() => { const f = () => setGuestTick((n) => n + 1); window.addEventListener('pumpstat:guest', f); return () => window.removeEventListener('pumpstat:guest', f); }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    rpc('my_sync_key').then((k) => { if (alive) setIngestKey(k || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [session]);

  if (!session) {
    // a fila do clube é pública: quem chega pelo QR/link não precisa de conta
    if (isQueueHash()) return <PublicQueue />;
    if (/^#\/excluir-conta/.test(window.location.hash)) return <div className="app"><header className="topbar"><a href="#/" className="brand"><Logo /> PIU Stats</a></header><main className="content"><DeleteInfo /></main></div>;
    if (/^#\/privacidade/.test(window.location.hash)) return <div className="app"><header className="topbar"><a href="#/" className="brand"><Logo /> PIU Stats</a></header><main className="content"><Privacy /></main></div>;
    if (isGuest()) return <GuestApp />;
    return <Login notice={fromUrl?.error ? t('Não foi possível entrar: {e}', { e: fromUrl.error })
      : takeSessionEnded() ? t('Sua sessão neste aparelho foi encerrada (isso acontece ao ativar a verificação em duas etapas). Entre de novo.') : ''} />;
  }
  return <MfaGate session={session}>
    {recovery && <NewPassword onDone={() => setRecovery(false)} />}
    <DataApp session={session} ingestKey={ingestKey} />
  </MfaGate>;
}

/** Verificação em duas etapas: com autenticador cadastrado, o app só abre depois do código (sessão aal2). */
function MfaGate({ session, children }) {
  const uid = session.user?.id;
  const aal2 = sessionAal(session) === 'aal2';
  const [need, setNeed] = useState(() => !aal2 && hasHint(uid));
  useEffect(() => {
    if (aal2) { setNeed(false); return undefined; }
    let alive = true;
    listFactors().then((l) => {
      const on = !!verifiedFactor(l);
      rememberHint(uid, on);
      if (alive) setNeed(on);
    }).catch(() => {});
    return () => { alive = false; };
  }, [uid, aal2]);
  useEffect(() => {
    const f = () => { if (sessionAal(getSession()) !== 'aal2') setNeed(true); };
    window.addEventListener('pumpstat:mfa-required', f);
    return () => window.removeEventListener('pumpstat:mfa-required', f);
  }, []);
  if (need && !aal2) return <MfaLogin session={session} onDone={() => setNeed(false)} />;
  return children;
}

const isQueueHash = () => /^#\/fila/.test(window.location.hash);

function PublicQueue() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  if (!isQueueHash()) return <Login />;
  return (
    <HashRouter>
      <Routes>
        <Route path="/fila/:slug/tv" element={<QueueTV />} />
        <Route path="*" element={
          <div className="app">
            <header className="topbar">
              <a href="#/fila" className="brand"><Logo /> PIU Stats</a>
              <a className="btn ghost" href="#/">{t('Entrar')}</a>
            </header>
            <main className="content">
              <Routes>
                <Route path="/fila/:slug" element={<Queue />} />
                <Route path="*" element={<Venues />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </HashRouter>
  );
}

function NewPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try { await updatePassword(pw); onDone(); } catch (ex) { setErr(ex.message); }
  };
  return (
    <div className="modal"><form className="login-card" onSubmit={save}>
      <h3>{t('Nova senha')}</h3>
      <label className="field">{t('Senha')}<input type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
      {err && <div className="form-err">{err}</div>}
      <button className="btn wide">{t('Salvar')}</button>
      <button type="button" className="link" onClick={onDone}>{t('Agora não')}</button>
    </form></div>
  );
}

function DataApp({ session, ingestKey }) {
  const [version, setVersionState] = useState(readVersion);
  const [data, setData] = useState(() => cachedVersion(readVersion()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async (v = version) => {
    setLoading(true); setError(null);
    try { setData(await fetchVersion(v, true)); } catch (e) { setError(e.message); }
    setLoading(false);
  }, [version]);

  useEffect(() => { setData(cachedVersion(version)); reload(version); }, [version]); // eslint-disable-line

  // primeira entrada sem nada guardado: antes de mostrar o app, baixa as capas que aparecem primeiro
  // (jogadas recentes e o começo da lista de músicas), com limite de tempo para não prender ninguém
  const [warm, setWarm] = useState(() => !!cachedVersion(readVersion()));
  useEffect(() => {
    if (warm || !data) return undefined;
    let done = false;
    const finish = () => { if (!done) { done = true; setWarm(true); } };
    const urls = [...new Set([
      ...data.plays.slice(0, 12).map((p) => p.chart.song.jacket),
      ...[...data.songs].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 16).map((s) => s.jacket),
    ].filter(Boolean))];
    let left = urls.length;
    if (!left) { finish(); return undefined; }
    urls.forEach((u) => { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.onload = im.onerror = () => { left -= 1; if (!left) finish(); }; im.src = u; });
    const h = setTimeout(finish, 3500);
    return () => clearTimeout(h);
  }, [data, warm]);

  // no app, antes da primeira tela, lê a pasta de imagens salvas (para as telas já usarem os arquivos locais)
  const [imgReady, setImgReady] = useState(!isNative);
  useEffect(() => {
    if (!isNative) return undefined;
    const h = setTimeout(() => setImgReady(true), 1500);
    initImgStore().finally(() => { clearTimeout(h); setImgReady(true); });
    return () => clearTimeout(h);
  }, []);

  // no app, quem escolheu "baixar todas as capas" completa o que faltar em segundo plano (as novas também)
  useEffect(() => {
    if (!isNative || !warm || !data || jacketMode() !== 'all') return undefined;
    const h = setTimeout(() => downloadJackets(data), 4000);
    return () => clearTimeout(h);
  }, [warm, data]);

  const setVersion = (v) => {
    try { localStorage.setItem('pumpstat:version', v); } catch { /* ignore */ }
    setVersionState(v);
  };

  const notifications = useNotifications(!!session);
  // capas e fotos das notificações também entram no download de imagens do app
  useEffect(() => { addImageUrls((notifications.items || []).flatMap((n) => [n.jacket, n.avatar])); }, [notifications.items]);
  const presence = usePresence(!!session);
  const [plan, setPlan] = useState(null);
  const [planReady, setPlanReady] = useState(false);
  const reloadPlan = useCallback(() => rpc('my_plan').then((p) => { setPlan(p); return p; }).catch(() => null).finally(() => setPlanReady(true)), []);
  useEffect(() => { reloadPlan(); }, [reloadPlan]);
  // cobrança pela Google Play (só no app Android, com a venda ligada pelo admin)
  const billingUser = session?.user?.id;
  const salesOn = !!plan?.config?.sales?.enabled;
  useEffect(() => {
    if (!salesOn || !billingUser) return;
    initBilling(plan?.config, billingUser).then((ok) => { if (ok) setPlan((p) => (p ? { ...p } : p)); });
  }, [salesOn, billingUser]); // eslint-disable-line
  // acorda a API e deixa ela atualizar o catálogo (no máximo 1x por dia)
  useEffect(() => { fetch(`${API_URL}/api/catalog/tick`).catch(() => {}); }, []);
  // modo de teste do admin: 100% da experiência do plano simulado (sem nada de administração)
  const viewPlan = useMemo(() => asPreviewUser(plan), [plan]);
  // treino em casa (StepP1 / XSanity): só com o recurso ligado no admin e ativado pela pessoa
  const homeAvail = isOn(viewPlan, 'home_import');
  const [home, setHome] = useState(null); // { settings, best }
  const reloadHome = useCallback(async () => {
    if (!homeAvail || !session) { setHome(null); return; }
    try {
      const settings = await rpc('my_home_settings');
      const best = settings?.on ? homeBest(await rpc('my_home_scores', { p_version: version })) : null;
      setHome({ settings, best });
    } catch { setHome(null); }
  }, [homeAvail, session, version]);
  useEffect(() => { reloadHome(); }, [reloadHome]);
  const viewData = useMemo(() => (home?.settings?.on && home.best ? withHome(data, home.best, home.settings.mode) : data), [data, home]);
  const viewNotifications = useMemo(() => (viewPlan?.realAdmin
    ? { ...notifications, items: notifications.items.filter((n) => !String(n.kind).startsWith('admin_')), unread: notifications.items.filter((n) => n.unread && !String(n.kind).startsWith('admin_')).length }
    : notifications), [viewPlan, notifications]);
  const ctx = useMemo(() => ({ version, setVersion, data: viewData, loading, error, reload, session, ingestKey, notifications: viewNotifications, presence, plan: viewPlan, planReady: planReady && imgReady && (warm || !!error), reloadPlan, home, reloadHome }),
    [version, viewData, loading, error, reload, session, ingestKey, viewNotifications, presence, viewPlan, planReady, imgReady, warm, reloadPlan, home, reloadHome]);

  return (
    <DataCtx.Provider value={ctx}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </DataCtx.Provider>
  );
}

const BOOT_STEPS = ['Entrando na sua conta…', 'Carregando seus recordes…', 'Buscando músicas e charts…', 'Montando o seu painel…', 'Quase lá…'];

/** Tela de carregamento da primeira entrada: logo, giro e o que está sendo carregado. */
export function BootScreen() {
  const [i, setI] = useState(0);
  useEffect(() => { const h = setInterval(() => setI((n) => Math.min(n + 1, BOOT_STEPS.length - 1)), 1400); return () => clearInterval(h); }, []);
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-mark"><div className="boot-ring" aria-hidden="true" /><Logo size={44} /></div>
      <div className="boot-name">PIU Stats</div>
      <p key={i} className="boot-step muted">{t(BOOT_STEPS[i])}</p>
    </div>
  );
}

function Shell() {
  const { version, setVersion, data, loading, error, reload, notifications, planReady } = useData();
  const loc = useLocation();
  const scroller = useRef(null);
  useEffect(() => { window.scrollTo(0, 0); scroller.current?.scrollTo(0, 0); }, [loc.pathname]);
  const desk = useIsDesktop();
  const [search, setSearch] = useState(false);
  const openSearch = useCallback(() => setSearch(true), []);
  useSearchHotkey(desk ? openSearch : noop);
  if (/^\/fila\/[^/]+\/tv$/.test(loc.pathname)) return <Routes><Route path="/fila/:slug/tv" element={<QueueTV />} /></Routes>;
  // primeira entrada (sem nada guardado no aparelho): tela de carregamento até chegarem os dados e o plano
  if ((!data && loading && !error) || !planReady) return <BootScreen />;

  return (
    <div className="app shell">
      <div className="shell-scroll" ref={scroller}>
      {desk && <Sidebar onSearch={openSearch} />}
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      <header className="topbar">
        {desk && <button type="button" className="top-search" onClick={openSearch}><Search size={16} /> <span>{t('Buscar música, artista, jogador ou página…')}</span><kbd>Ctrl K</kbd></button>}
        <NavLink to="/" end className="brand" title={t('Início')}><Logo /> <span className="brand-text">PIU Stats</span></NavLink>
        <StatusPicker />
        <NavLink to="/notificacoes" className="bell" aria-label={t('Notificações')}>
          <Bell size={21} strokeWidth={2} />{notifications?.unread > 0 && <span className="badge">{notifications.unread > 9 ? '9+' : notifications.unread}</span>}
        </NavLink>
        <div className="seg" role="tablist" aria-label={t('Versão')}>
          {Object.values(VERSIONS).map((v) => (
            <button key={v.id} className={v.id === version ? 'on' : ''} onClick={() => setVersion(v.id)}>{v.name}</button>
          ))}
        </div>
      </header>

      <ViewAsBanner />
      <PreviewBanner />
      {loading && <div className="loadbar" />}
      {error && (
        <div className="banner err">
          {t('Não consegui carregar os dados:')} {tErr(error)} <button onClick={() => reload()}>{t('Tentar de novo')}</button>
        </div>
      )}

      <main className="content">
        {!data ? (
          <div className="empty">{loading ? t('Carregando…') : t('Sem dados ainda.')}</div>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/musicas" element={<Songs />} />
            <Route path="/musica/:id" element={<Song />} />
            <Route path="/chart/:id" element={<Chart />} />
            <Route path="/tier" element={<Tier />} />
            <Route path="/recentes" element={<Recent />} />
            <Route path="/ajustes" element={<Settings />} />
            <Route path="/fila" element={<Venues />} />
            <Route path="/titulos" element={<Titles />} />
            <Route path="/titulos/:userId" element={<Titles />} />
            <Route path="/jogadores" element={<Players />} />
            <Route path="/jogador/:id" element={<PlayerProfile />} />
            <Route path="/jogador/:id/vs" element={<ComparePlayer />} />
            <Route path="/fila/:slug" element={<Queue />} />
            <Route path="/recomendacoes" element={<Recommend />} />
            <Route path="/progresso" element={<Progress />} />
            <Route path="/votacoes" element={<Votes />} />
            <Route path="/desafios" element={<Challenges />} />
            <Route path="/notificacoes" element={<Notifications />} />
            <Route path="/online" element={<Online />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/planos" element={<Plans />} />
            <Route path="/assinatura" element={<Subscription />} />
            <Route path="/treino" element={<Training />} />
            <Route path="/treino-casa" element={<HomeTraining />} />
            <Route path="/time" element={<MyTeam />} />
            <Route path="/dia" element={<DayReport />} />
            <Route path="/dia/:day" element={<DayReport />} />
            <Route path="/novidades" element={<ReleaseNotes />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/excluir-conta" element={<DeleteInfo />} />
            <Route path="*" element={<Home />} />
          </Routes>
        )}
      </main>

      <InviteToast />
      <FriendOnlineToast />
      <AdminSignupToast />
      <NotifToast />
      <QuizPrompt /><Tour /><MfaInvite />
      </div>

      <nav className="tabbar">
        <Tab to="/" icon={<HomeIcon size={21} />} label={t('Início')} />
        <Tab to="/musicas" icon={<Music2 size={21} />} label={t('Músicas')} />
        <Tab to="/tier" icon={<LayoutGrid size={21} />} label={t('Tier')} />
        <Tab to="/fila" icon={<ListOrdered size={21} />} label={t('Fila')} />
        <Tab to="/ajustes" icon={<SettingsIcon size={21} />} label={t('Ajustes')} />
      </nav>
    </div>
  );
}

function Tab({ to, icon, label }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
      <span className="ico" aria-hidden>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

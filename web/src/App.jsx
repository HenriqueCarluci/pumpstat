import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { cachedVersion, clearCache, fetchVersion, rpc } from './lib/api.js';
import { getSession, onSession, sessionFromUrl, signOut, updatePassword } from './lib/auth.js';
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

const DataCtx = createContext(null);
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

  useEffect(() => {
    if (!session) return;
    let alive = true;
    rpc('my_sync_key').then((k) => { if (alive) setIngestKey(k || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [session]);

  if (!session) {
    // a fila do clube é pública: quem chega pelo QR/link não precisa de conta
    if (isQueueHash()) return <PublicQueue />;
    return <Login notice={fromUrl?.error ? `Não foi possível entrar: ${fromUrl.error}` : ''} />;
  }
  return (
    <>
      {recovery && <NewPassword onDone={() => setRecovery(false)} />}
      <DataApp session={session} ingestKey={ingestKey} />
    </>
  );
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
              <div className="brand"><span className="logo">▲</span> StepClub</div>
              <a className="btn ghost" href="#/">Entrar</a>
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
      <h3>Nova senha</h3>
      <label className="field">Senha<input type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
      {err && <div className="form-err">{err}</div>}
      <button className="btn wide">Salvar</button>
      <button type="button" className="link" onClick={onDone}>Agora não</button>
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
    try { setData(await fetchVersion(v)); } catch (e) { setError(e.message); }
    setLoading(false);
  }, [version]);

  useEffect(() => { setData(cachedVersion(version)); reload(version); }, [version]); // eslint-disable-line

  const setVersion = (v) => {
    try { localStorage.setItem('pumpstat:version', v); } catch { /* ignore */ }
    setVersionState(v);
  };

  const ctx = useMemo(() => ({ version, setVersion, data, loading, error, reload, session, ingestKey }),
    [version, data, loading, error, reload, session, ingestKey]);

  return (
    <DataCtx.Provider value={ctx}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </DataCtx.Provider>
  );
}

function Shell() {
  const { version, setVersion, data, loading, error, reload } = useData();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  if (/^\/fila\/[^/]+\/tv$/.test(loc.pathname)) return <Routes><Route path="/fila/:slug/tv" element={<QueueTV />} /></Routes>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">▲</span> StepClub</div>
        <div className="seg" role="tablist" aria-label="Versão">
          {Object.values(VERSIONS).map((v) => (
            <button key={v.id} className={v.id === version ? 'on' : ''} onClick={() => setVersion(v.id)}>{v.name}</button>
          ))}
        </div>
      </header>

      {loading && <div className="loadbar" />}
      {error && (
        <div className="banner err">
          Não consegui carregar os dados: {error} <button onClick={() => reload()}>Tentar de novo</button>
        </div>
      )}

      <main className="content">
        {!data ? (
          <div className="empty">{loading ? 'Carregando…' : 'Sem dados ainda.'}</div>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/musicas" element={<Songs />} />
            <Route path="/musica/:id" element={<Song />} />
            <Route path="/tier" element={<Tier />} />
            <Route path="/recentes" element={<Recent />} />
            <Route path="/ajustes" element={<Settings />} />
            <Route path="/fila" element={<Venues />} />
            <Route path="/fila/:slug" element={<Queue />} />
            <Route path="*" element={<Home />} />
          </Routes>
        )}
      </main>

      <nav className="tabbar">
        <Tab to="/" icon="◉" label="Início" />
        <Tab to="/musicas" icon="♫" label="Músicas" />
        <Tab to="/tier" icon="▦" label="Tier" />
        <Tab to="/fila" icon="☰" label="Fila" />
        <Tab to="/ajustes" icon="⚙" label="Ajustes" />
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

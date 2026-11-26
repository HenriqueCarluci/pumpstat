import { useEffect, useRef, useState } from 'react';
import { accessToken } from '../lib/auth.js';
import { API_URL } from '../lib/config.js';
import { useData } from '../App.jsx';
import SyncBookmarklet from './SyncBookmarklet.jsx';

/** Formulário "Conectar Pump It Up": o servidor entra no piugame com o login AM.PASS e importa os dados. */
export default function PiuConnect({ onDone, compact }) {
  const { ingestKey } = useData();
  const [method, setMethod] = useState(() => { try { return localStorage.getItem('pumpstat:piu-method') || 'password'; } catch { return 'password'; } });
  const pick = (m) => { setMethod(m); try { localStorage.setItem('pumpstat:piu-method', m); } catch { /* ignore */ } };
  const [login, setLogin] = useState(() => { try { return localStorage.getItem('pumpstat:piu-login') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [versions, setVersions] = useState({ phoenix2: true, phoenix: true });
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const call = async (path, opts = {}) => {
    const token = await accessToken();
    const res = await fetch(API_URL + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 409) throw new Error(body.error || `Erro ${res.status}`);
    return body;
  };

  const poll = async (id) => {
    try {
      const j = await call(`/api/piu/jobs/${id}`);
      setJob(j);
      if (j.state === 'running') timer.current = setTimeout(() => poll(id), 1500);
      else if (j.state === 'done') onDone?.(j);
    } catch (e) { setErr(e.message); setJob(null); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setJob({ state: 'running', message: 'Conectando ao servidor (pode levar até 1 minuto se ele estiver dormindo)…' });
    try {
      try { localStorage.setItem('pumpstat:piu-login', login.trim()); } catch { /* ignore */ }
      const vs = Object.keys(versions).filter((v) => versions[v]);
      const r = await call('/api/piu/sync', { method: 'POST', body: JSON.stringify({ login: login.trim(), password, versions: vs }) });
      setPassword('');
      poll(r.jobId);
    } catch (ex) { setErr(ex.message); setJob(null); }
  };

  const running = job?.state === 'running';
  return (
    <form className={`piu-connect ${compact ? 'compact' : ''}`} onSubmit={submit} autoComplete="on">
      {!compact && (
        <>
          <h3>Conectar sua conta Pump It Up</h3>
          <p className="muted small">Use o mesmo login do piugame.com (AM.PASS). A senha é usada só para entrar no site e buscar seus dados; ela não fica salva.</p>
        </>
      )}
      <div className="tabs2" role="tablist" aria-label="Como você entra no piugame">
        <button type="button" className={method === 'password' ? 'on' : ''} onClick={() => pick('password')}>ID e senha AM.PASS</button>
        <button type="button" className={method === 'sso' ? 'on' : ''} onClick={() => pick('sso')}>Google / rede social</button>
      </div>
      {method === 'sso' ? (
        <div className="sso-steps">
          <p className="small">Se você entra no piugame.com com <b>Google</b> (ou outra rede social do AM.PASS), o login precisa acontecer no seu navegador. Então o StepClub lê os dados direto da página oficial:</p>
          <ol className="steps small">
            <li>Arraste o botão abaixo para a barra de favoritos (no celular: copie o código e salve como favorito).</li>
            <li>Abra <a href="https://piugame.com/my_page/my_best_score.php" target="_blank" rel="noreferrer">piugame.com</a> e entre com o Google.</li>
            <li>Clique no favorito <b>StepClub Sync</b>. Para a Phoenix, repita em <a href="https://phoenix.piugame.com/my_page/my_best_score.php" target="_blank" rel="noreferrer">phoenix.piugame.com</a>.</li>
          </ol>
          <SyncBookmarklet syncKey={ingestKey} />
          <button type="button" className="btn ghost wide" onClick={() => onDone?.()}>Já sincronizei, atualizar</button>
        </div>
      ) : (
      <>
      <label className="field">Login AM.PASS (e-mail ou ID)
        <input name="username" autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} disabled={running} />
      </label>
      <label className="field">Senha
        <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={running} />
      </label>
      <div className="checks">
        <label><input type="checkbox" checked={versions.phoenix2} onChange={(e) => setVersions({ ...versions, phoenix2: e.target.checked })} disabled={running} /> Phoenix 2</label>
        <label><input type="checkbox" checked={versions.phoenix} onChange={(e) => setVersions({ ...versions, phoenix: e.target.checked })} disabled={running} /> Phoenix</label>
      </div>
      {err && <div className="form-err">{err}</div>}
      {job && (
        <div className={`job ${job.state}`}>
          {running && <span className="spinner" />}
          <span>{job.message}</span>
          {job.state === 'done' && job.results && (
            <ul className="small">
              {Object.entries(job.results).map(([v, r]) => (
                <li key={v}>{v === 'phoenix' ? 'Phoenix' : 'Phoenix 2'}: {r.bests} recordes ({r.new_bests} novos) · {r.plays} jogadas ({r.new_plays} novas)</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button className="btn wide" disabled={running}>{running ? 'Sincronizando…' : 'Entrar e sincronizar'}</button>
      </>
      )}
    </form>
  );
}

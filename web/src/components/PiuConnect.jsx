import { useEffect, useRef, useState } from 'react';
import { accessToken } from '../lib/auth.js';
import { API_URL } from '../lib/config.js';

const AMPASS_RECOVER = 'https://am-pass.net/bbs/password_lost.php';

/** "Conectar Pump It Up": o servidor entra no piugame com o login AM.PASS e importa Phoenix 2 e Phoenix. */
export default function PiuConnect({ onDone, compact }) {
  const [login, setLogin] = useState(() => { try { return localStorage.getItem('pumpstat:piu-login') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(false);
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
    setJob({ state: 'running', message: 'Conectando… (na primeira vez pode levar até 1 minuto)' });
    try {
      try { localStorage.setItem('pumpstat:piu-login', login.trim()); } catch { /* ignore */ }
      const r = await call('/api/piu/sync', { method: 'POST', body: JSON.stringify({ login: login.trim(), password }) });
      setPassword('');
      poll(r.jobId);
    } catch (ex) { setErr(ex.message); setJob(null); }
  };

  const running = job?.state === 'running';
  return (
    <form className="piu-connect" onSubmit={submit} autoComplete="on">
      {!compact && (
        <div className="piu-head">
          <img src="https://piugame.com/l_img/logo.png" alt="" referrerPolicy="no-referrer" />
          <div>
            <h3>Entrar com a conta Pump It Up</h3>
            <p className="muted small">O mesmo login do piugame.com (AM.PASS). Importamos Phoenix 2 e Phoenix.</p>
          </div>
        </div>
      )}
      <label className="field">E-mail ou ID AM.PASS
        <input name="username" autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} disabled={running} />
      </label>
      <label className="field">Senha AM.PASS
        <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={running} />
      </label>
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
      <button type="button" className="link small" onClick={() => setHelp((h) => !h)}>Entro no piugame com Google</button>
      {help && (
        <p className="muted small help">
          Contas AM.PASS com Google também têm e-mail. Se você nunca criou uma senha, peça uma em{' '}
          <a href={AMPASS_RECOVER} target="_blank" rel="noreferrer">am-pass.net → Find My Account</a> com o mesmo e-mail do Google
          e use aqui. O login com Google continua funcionando normalmente no jogo e no site.
        </p>
      )}
      <p className="muted small">A senha é usada só para entrar no piugame e buscar seus dados; ela não fica salva.</p>
    </form>
  );
}

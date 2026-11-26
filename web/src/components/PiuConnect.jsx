import { useEffect, useRef, useState } from 'react';
import { accessToken } from '../lib/auth.js';
import { API_URL } from '../lib/config.js';
import { t, tMsg } from '../lib/i18n.js';
import { ChevronRight, RefreshCw } from './Icons.jsx';

const AMPASS_RECOVER = 'https://am-pass.net/bbs/password_lost.php';

/** Dispara uma sincronização no servidor e acompanha o andamento. */
export function useSyncJob(onDone) {
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const call = async (path, opts = {}) => {
    const token = await accessToken();
    const res = await fetch(API_URL + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 409) { const e = new Error(tMsg(body.error) || `${t('Erro')} ${res.status}`); e.needLogin = body.needLogin; throw e; }
    return body;
  };
  const poll = async (id) => {
    try {
      const j = await call(`/api/piu/jobs/${id}`);
      setJob(j);
      if (j.state === 'running') timer.current = setTimeout(() => poll(id), 1500);
      else if (j.state === 'done') onDone?.(j);
      else if (j.needLogin) setNeedLogin(true);
    } catch (e) { setErr(tMsg(e.message)); setJob(null); }
  };
  const start = async (body) => {
    setErr(''); setNeedLogin(false);
    setJob({ state: 'running', message: t('Conectando… (na primeira vez pode levar até 1 minuto)') });
    try {
      const r = await call('/api/piu/sync', { method: 'POST', body: JSON.stringify(body) });
      if (r.jobId) poll(r.jobId);
      return true;
    } catch (ex) { setErr(tMsg(ex.message)); setJob(null); if (ex.needLogin) setNeedLogin(true); return false; }
  };
  return { job, err, needLogin, start, running: job?.state === 'running' };
}

export function JobStatus({ job }) {
  if (!job) return null;
  return (
    <div className={`job ${job.state}`}>
      {job.state === 'running' && <span className="spinner" />}
      <span>{tMsg(job.message)}</span>
      {job.state === 'done' && job.results && (
        <ul className="small">
          {Object.entries(job.results).map(([v, r]) => (
            <li key={v}>{v === 'phoenix' ? 'Phoenix' : 'Phoenix 2'}: {t('{a} recordes ({b} novos) · {c} jogadas ({d} novas)', { a: r.bests, b: r.new_bests, c: r.plays, d: r.new_plays })}{r.titles ? ` · ${t('{n} títulos', { n: r.titles })}` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Botão "Sincronizar agora": usa a sessão do piugame guardada (criptografada) sem pedir a senha. */
export function QuickSync({ onDone }) {
  const { job, err, needLogin, start, running } = useSyncJob(onDone);
  return (
    <div className="piu-connect">
      <button className="btn wide" disabled={running} onClick={() => start({ useSaved: true })}>
        {running ? t('Sincronizando…') : <><RefreshCw size={16} /> {t('Sincronizar agora')}</>}
      </button>
      {err && <div className="form-err">{err}</div>}
      <JobStatus job={job} />
      {needLogin && <PiuConnect compact onDone={onDone} />}
    </div>
  );
}

/** "Conectar Pump It Up": o servidor entra no piugame com o login AM.PASS e importa Phoenix 2 e Phoenix. */
export default function PiuConnect({ onDone, compact }) {
  const [login, setLogin] = useState(() => { try { return localStorage.getItem('pumpstat:piu-login') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [help, setHelp] = useState(false);
  const { job, err, start, running } = useSyncJob(onDone);

  const submit = async (e) => {
    e.preventDefault();
    try { localStorage.setItem('pumpstat:piu-login', login.trim()); } catch { /* ignore */ }
    if (await start({ login: login.trim(), password })) setPassword('');
  };

  return (
    <form className="piu-connect" onSubmit={submit} autoComplete="on">
      {!compact && (
        <div className="piu-head">
          <img src="https://piugame.com/l_img/logo.png" alt="" referrerPolicy="no-referrer" />
          <div>
            <h3>{t('Entrar com a conta Pump It Up')}</h3>
            <p className="muted small">{t('O mesmo login do piugame.com (AM.PASS). Importamos Phoenix 2 e Phoenix.')}</p>
          </div>
        </div>
      )}
      <label className="field">{t('E-mail ou ID AM.PASS')}
        <input name="username" autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} disabled={running} />
      </label>
      <label className="field">{t('Senha AM.PASS')}
        <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={running} />
      </label>
      {err && <div className="form-err">{err}</div>}
      <JobStatus job={job} />
      <button className="btn wide" disabled={running}>{running ? t('Sincronizando…') : t('Entrar e sincronizar')}</button>
      <button type="button" className="link small" onClick={() => setHelp((h) => !h)}>{t('Entro no piugame com Google')}</button>
      {help && (
        <p className="muted small help">
          {t('Contas AM.PASS com Google também têm e-mail. Se você nunca criou uma senha, peça uma em am-pass.net → Find My Account com o mesmo e-mail do Google e use aqui. O login com Google continua funcionando normalmente no jogo e no site.')}{' '}
          <a href={AMPASS_RECOVER} target="_blank" rel="noreferrer">am-pass.net <ChevronRight size={14} /></a>
        </p>
      )}
      <p className="muted small">{t('A senha é usada só para entrar no piugame e não fica salva. Guardamos apenas a sessão do site (criptografada) para o botão "Sincronizar agora" funcionar sem pedir a senha de novo.')}</p>
    </form>
  );
}

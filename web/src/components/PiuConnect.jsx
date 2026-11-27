import { useEffect, useRef, useState } from 'react';
import { accessToken } from '../lib/auth.js';
import { API_URL } from '../lib/config.js';
import { t, tMsg } from '../lib/i18n.js';
import { ChevronRight, RefreshCw } from './Icons.jsx';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { syncAdOn } from '../lib/ads.js';
import AdSlot from './AdSlot.jsx';

/** Plano grátis: a sincronização sempre mostra um anúncio enquanto roda (Plus e Pro sincronizam sem anúncio). */
export function SyncAd({ running }) {
  const { plan } = useData();
  if (!running || !syncAdOn(plan)) return null;
  return (
    <div className="sync-ad">
      <AdSlot place="sync" force />
      <p className="muted tiny">{t('Seus dados estão sendo sincronizados.')} <Link to="/planos">{t('Sincronize sem anúncio no Plus')}</Link></p>
    </div>
  );
}

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
      setJob((prev) => ({ ...j, id, login: prev?.login }));
      if (j.state === 'running' || j.state === 'choose' || j.state === 'confirm') timer.current = setTimeout(() => poll(id), j.state === 'running' ? 1500 : 2500);
      else if (j.state === 'done') onDone?.(j);
      else if (j.needLogin) setNeedLogin(true);
    } catch (e) { setErr(tMsg(e.message)); setJob(null); }
  };
  const start = async (body) => {
    setErr(''); setNeedLogin(false);
    setJob({ state: 'running', message: t('Conectando… (na primeira vez pode levar até 1 minuto)') });
    try {
      const r = await call('/api/piu/sync', { method: 'POST', body: JSON.stringify({ ...body, account: body.account || (body.login ? accountFor(body.login) : undefined) }) });
      if (r.jobId) { setJob((j) => ({ ...j, id: r.jobId, login: body.login })); poll(r.jobId); }
      return true;
    } catch (ex) { setErr(tMsg(ex.message)); setJob(null); if (ex.needLogin) setNeedLogin(true); return false; }
  };
  /** Conta com mais de um ID de jogo: manda o escolhido e a sincronização continua. */
  const choose = async (account) => {
    if (!job?.id) return;
    rememberAccount(job.login, account);
    setJob({ ...job, state: 'running', message: t('Trocando de conta…') });
    try { await call(`/api/piu/jobs/${job.id}/choose`, { method: 'POST', body: JSON.stringify({ account }) }); } catch (e) { setErr(tMsg(e.message)); }
  };
  /** Vínculo: mesmo jogador / outro jogador / mover de outra conta / cancelar. */
  const confirm = async (decision) => {
    if (!job?.id) return;
    setJob({ ...job, state: 'running', message: decision.cancel ? t('Cancelando…') : t('Atualizando o vínculo…') });
    try { await call(`/api/piu/jobs/${job.id}/confirm`, { method: 'POST', body: JSON.stringify(decision) }); } catch (e) { setErr(tMsg(e.message)); }
  };
  return { job, err, needLogin, start, choose, confirm, running: ['running', 'choose', 'confirm'].includes(job?.state) };
}

const ACC_KEY = 'pumpstat:piu-accounts';
const savedAccounts = () => { try { return JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); } catch { return {}; } };
function rememberAccount(login, account) {
  try { localStorage.setItem(ACC_KEY, JSON.stringify({ ...savedAccounts(), [(login || '*').toLowerCase()]: account })); } catch { /* ignore */ }
}
const accountFor = (login) => savedAccounts()[(login || '*').toLowerCase()] || null;

const piuImg = (src) => (!src ? null : /^https?:/i.test(src) ? src : `https://piugame.com${src.startsWith('/') ? '' : '/'}${src}`);

/** Antes de gravar: o ID já está em outra conta do app, ou esta conta já tinha outro ID com notas. */
function LinkConfirm({ job, onConfirm }) {
  const l = job.link || {};
  const [mode, setMode] = useState(null);
  const [move, setMove] = useState(false);
  const ready = (!l.changed || mode) && (!l.taken || move);
  const go = () => {
    if (mode === 'other' && !window.confirm(t('Apagar as notas, jogadas e histórico de {old} desta conta e importar {nw}? Amigos, time e ajustes continuam.', { old: l.current, nw: l.game_id }))) return;
    if (move && !window.confirm(t('A outra conta do PIU Stats perde as notas importadas de {nw}. Continuar?', { nw: l.game_id }))) return;
    onConfirm({ mode, move });
  };
  return (
    <div className="link-confirm">
      {l.changed && (
        <div className="lc-block">
          <p className="small">{t('Esta conta do PIU Stats estava com as notas de {old}. Agora você entrou com {nw}.', { old: l.current, nw: l.game_id })}</p>
          <label className={`lc-opt${mode === 'same' ? ' on' : ''}`}><input type="radio" name="lc-mode" checked={mode === 'same'} onChange={() => setMode('same')} />
            <span><b>{t('É o mesmo jogador')}</b><small className="muted">{t('Mudei o nick no piugame. Tudo continua e as notas novas se juntam às antigas.')}</small></span></label>
          <label className={`lc-opt${mode === 'other' ? ' on' : ''}`}><input type="radio" name="lc-mode" checked={mode === 'other'} onChange={() => setMode('other')} />
            <span><b>{t('É outro jogador')}</b><small className="muted">{t('Apaga as notas, jogadas e histórico de {old} desta conta antes de importar. Amigos, time e ajustes continuam.', { old: l.current })}</small></span></label>
        </div>
      )}
      {l.taken && (
        <div className="lc-block">
          <p className="small">{t('O ID {nw} já está vinculado a outra conta do PIU Stats. Um ID de jogo só pode ficar em uma conta.', { nw: l.game_id })}</p>
          <label className={`lc-opt${move ? ' on' : ''}`}><input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
            <span><b>{t('Trazer o vínculo para esta conta')}</b><small className="muted">{t('A outra conta perde as notas importadas e a sincronização (amigos e time dela continuam). Ela recebe um aviso.')}</small></span></label>
        </div>
      )}
      <div className="bm-row">
        <button type="button" className="btn" disabled={!ready} onClick={go}>{t('Continuar')}</button>
        <button type="button" className="link muted" onClick={() => onConfirm({ cancel: true })}>{t('Cancelar sem gravar')}</button>
      </div>
    </div>
  );
}

/** Escolha do ID de jogo (conta AM.PASS com mais de um cartão). */
function AccountChooser({ job, onChoose }) {
  return (
    <div className="acc-choose">
      <p className="small">{t('Sua conta AM.PASS tem mais de um ID de jogo. Qual você quer vincular ao PIU Stats?')}</p>
      <div className="acc-cards">
        {(job.accounts || []).map((a) => (
          <button key={a.nickname} type="button" className={`acc-card${a.current ? ' on' : ''}`} onClick={() => onChoose(a.nickname)}>
            {a.avatar ? <img src={piuImg(a.avatar)} alt="" referrerPolicy="no-referrer" /> : <span className="acc-ph" />}
            {a.title && <small className="acc-title">{a.title}</small>}
            <b>{a.nickname}</b>
            {a.current && <small className="muted">{t('ativa agora no site')}</small>}
          </button>
        ))}
      </div>
      <p className="muted tiny">{t('Dá para trocar depois: entre de novo com a sua senha e escolha outro ID.')}</p>
    </div>
  );
}

export function JobStatus({ job, onChoose, onConfirm }) {
  if (!job) return null;
  if (job.state === 'choose') return <AccountChooser job={job} onChoose={onChoose} />;
  if (job.state === 'confirm') return <LinkConfirm job={job} onConfirm={onConfirm} />;
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
  const { job, err, needLogin, start, choose, confirm, running } = useSyncJob(onDone);
  return (
    <div className="piu-connect">
      <button className="btn wide" disabled={running} onClick={() => start({ useSaved: true })}>
        {running ? t('Sincronizando…') : <><RefreshCw size={16} /> {t('Sincronizar agora')}</>}
      </button>
      {err && <div className="form-err">{err}</div>}
      <JobStatus job={job} onChoose={choose} onConfirm={confirm} />
      <SyncAd running={running} />
      {needLogin && <PiuConnect compact onDone={onDone} />}
    </div>
  );
}

/** "Conectar Pump It Up": o servidor entra no piugame com o login AM.PASS e importa Phoenix 2 e Phoenix. */
export default function PiuConnect({ onDone, compact }) {
  const [login, setLogin] = useState(() => { try { return localStorage.getItem('pumpstat:piu-login') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [help, setHelp] = useState(false);
  const { job, err, start, choose, confirm, running } = useSyncJob(onDone);

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
      <JobStatus job={job} onChoose={choose} onConfirm={confirm} />
      <SyncAd running={running} />
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

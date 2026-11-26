import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { fmtDate, timeAgo } from '../components/ui.jsx';
import { fmtNum, t, tErr } from '../lib/i18n.js';
import { Check, Crown, ShieldCheck, ShieldOff, UserX, UserCheck } from '../components/Icons.jsx';
import { Chips } from './Songs.jsx';

/** Painel do administrador: resumo, usuários (planos, bloqueio, admin) e mensagens do suporte. */
export default function Admin() {
  const { plan } = useData();
  const [tab, setTab] = useState('users');
  if (!plan?.admin) return <div className="page"><p className="empty">{t('só administradores')}</p></div>;
  return (
    <div className="page admin">
      <h2>{t('Administração')}</h2>
      <Stats />
      <Chips value={tab} onChange={setTab} options={[['users', t('Usuários')], ['feedback', t('Suporte')]]} />
      {tab === 'users' ? <Users /> : <FeedbackList />}
    </div>
  );
}

function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => { rpc('admin_stats').then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const items = [['Usuários', s.users], ['Novos (7 dias)', s.new_7d], ['Ativos (7 dias)', s.active_7d], ['Online agora', s.online],
    ['Com conta da Pump', s.linked], ['StepClub+', s.plus], ['Suporte em aberto', s.feedback_open], ['Bloqueados', s.banned]];
  return (
    <div className="admin-stats">
      {items.map(([l, v]) => <div key={l} className="stat"><div className="v">{fmtNum(v)}</div><div className="l">{t(l)}</div></div>)}
    </div>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const load = async (term = q) => {
    try { setList(await rpc('admin_users', { p_query: term, p_limit: 100, p_offset: 0 })); setErr(''); } catch (e) { setErr(tErr(e.message)); }
  };
  useEffect(() => { const h = setTimeout(() => load(q), 250); return () => clearTimeout(h); }, [q]); // eslint-disable-line

  return (
    <>
      <input className="admin-search" placeholder={t('Buscar por e-mail ou nickname…')} value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <div className="form-err">{err}</div>}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}
      <div className="admin-users">
        {(list || []).map((u) => (
          <UserRow key={u.id} u={u} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} onChange={() => load()} />
        ))}
      </div>
    </>
  );
}

function UserRow({ u, open, onToggle, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState(u.plan_note || '');
  const run = async (fn, args, confirm) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setErr('');
    try { await rpc(fn, args); await onChange(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const plus = u.plan === 'plus';
  const planText = !plus ? t('Grátis')
    : u.plan_source === 'lifetime' ? `StepClub+ · ${t('vitalício')}`
      : u.plan_source === 'store' ? `StepClub+ · ${t('loja')}`
        : `StepClub+ · ${t('até {d}', { d: fmtDate(u.plan_expires) })}`;
  return (
    <div className={`admin-user ${u.banned ? 'banned' : ''}`}>
      <button className="admin-user-head" onClick={onToggle}>
        <span className="q-avatar" style={{ width: 40, height: 40 }}>{u.avatar ? <img src={u.avatar} alt="" referrerPolicy="no-referrer" /> : (u.nickname || u.email || '?').slice(0, 2)}</span>
        <span className="admin-user-info">
          <b>{u.nickname || t('Sem conta da Pump')}</b>
          <small className="muted">{u.email} · {u.provider}</small>
          <span className="online-tags">
            <span className={`tag ${plus ? 'plus' : ''}`}>{planText}</span>
            {u.admin && <span className="tag admin-tag ic-row"><ShieldCheck size={12} /> admin</span>}
            {u.banned && <span className="tag warn">{t('bloqueado')}</span>}
          </span>
        </span>
        <small className="muted">{u.last_seen ? timeAgo(u.last_seen) : timeAgo(u.last_sign_in)}</small>
      </button>
      {open && (
        <div className="admin-user-body">
          <div className="admin-facts small muted">
            <span>{t('Conta criada')}: {fmtDate(u.created_at)}</span>
            <span>{t('Último login')}: {fmtDate(u.last_sign_in)}</span>
            <span>{t('Última sincronização')}: {u.last_sync ? fmtDate(u.last_sync) : '—'}</span>
            {u.pumbility != null && <span>PUMBILITY: {fmtNum(Math.round(u.pumbility))}</span>}
            {u.title && <span>{t('Título')}: {u.title}</span>}
          </div>
          <div className="rv-label">{t('Liberar StepClub+ (cortesia)')}</div>
          <input placeholder={t('Motivo (opcional), ex.: membro do clube')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          <div className="chips">
            {[[30, '30 dias'], [90, '3 meses'], [365, '1 ano'], [null, 'Vitalício']].map(([d, l]) => (
              <button key={l} disabled={busy} onClick={() => run('admin_set_plan', { p_user: u.id, p_plan: 'plus', p_days: d, p_note: note || null })}>
                <Crown size={13} /> {t(l)}
              </button>
            ))}
            {plus && u.plan_source !== 'store' && (
              <button disabled={busy} onClick={() => run('admin_set_plan', { p_user: u.id, p_plan: 'free' }, t('Remover o StepClub+ deste usuário?'))}>{t('Remover plano')}</button>
            )}
          </div>
          <div className="rv-label">{t('Conta')}</div>
          <div className="bm-row">
            {u.banned
              ? <button className="btn ghost" disabled={busy} onClick={() => run('admin_set_banned', { p_user: u.id, p_banned: false })}><UserCheck size={15} /> {t('Desbloquear')}</button>
              : <button className="btn ghost danger" disabled={busy} onClick={() => run('admin_set_banned', { p_user: u.id, p_banned: true }, t('Bloquear esta conta? A pessoa sai do app e não consegue entrar de novo.'))}><UserX size={15} /> {t('Bloquear')}</button>}
            {u.admin
              ? <button className="btn ghost" disabled={busy} onClick={() => run('admin_set_admin', { p_user: u.id, p_admin: false }, t('Tirar o acesso de administrador?'))}><ShieldOff size={15} /> {t('Tirar admin')}</button>
              : <button className="btn ghost" disabled={busy} onClick={() => run('admin_set_admin', { p_user: u.id, p_admin: true }, t('Dar acesso de administrador? A pessoa poderá gerenciar planos e usuários.'))}><ShieldCheck size={15} /> {t('Tornar admin')}</button>}
            {u.linked && <Link className="btn ghost" to={`/jogador/${u.id}`}>{t('Ver perfil')}</Link>}
          </div>
          {err && <div className="form-err">{err}</div>}
        </div>
      )}
    </div>
  );
}

const KIND = { question: 'Dúvida', bug: 'Problema', idea: 'Sugestão', other: 'Outro' };

function FeedbackList() {
  const [status, setStatus] = useState('open');
  const [list, setList] = useState(null);
  const load = () => rpc('admin_feedback', { p_status: status }).then(setList).catch(() => setList([]));
  useEffect(() => { setList(null); load(); }, [status]); // eslint-disable-line
  const mark = async (id, s) => { await rpc('admin_feedback_status', { p_id: id, p_status: s }); load(); };
  return (
    <>
      <Chips value={status} onChange={setStatus} options={[['open', t('Em aberto')], ['done', t('Resolvidas')], ['all', t('Todas')]]} />
      {list && !list.length && <p className="empty">{t('Nenhuma mensagem aqui.')}</p>}
      <div className="admin-feedback">
        {(list || []).map((f) => (
          <div key={f.id} className={`card fb ${f.status}`}>
            <div className="row-between">
              <span className="tag">{t(KIND[f.kind] || f.kind)} #{f.id}</span>
              <small className="muted">{fmtDate(f.at)}</small>
            </div>
            <p className="fb-msg">{f.message}</p>
            <small className="muted">
              {f.nickname || f.email}{f.contact && f.contact !== f.email ? ` · ${t('responder para')} ${f.contact}` : ''}
              {f.meta?.page ? ` · ${f.meta.page}` : ''}{f.meta?.lang ? ` · ${f.meta.lang}` : ''}
            </small>
            <div className="bm-row">
              {(f.contact || f.email) && <a className="btn ghost" href={`mailto:${f.contact || f.email}?subject=${encodeURIComponent(`StepClub #${f.id}`)}`}>{t('Responder por e-mail')}</a>}
              {f.status === 'open'
                ? <button className="btn" onClick={() => mark(f.id, 'done')}><Check size={15} /> {t('Marcar como resolvida')}</button>
                : <button className="btn ghost" onClick={() => mark(f.id, 'open')}>{t('Reabrir')}</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

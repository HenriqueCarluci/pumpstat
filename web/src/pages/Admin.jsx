import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProposalCard } from '../components/TierVote.jsx';
import { useData } from '../App.jsx';
import { DEFAULT_PRODUCTS } from '../lib/billing.js';
import { rpc } from '../lib/api.js';
import { fmtDate, timeAgo } from '../components/ui.jsx';
import { fmtNum, t, tErr } from '../lib/i18n.js';
import { Check, Crown, ShieldCheck, UserX, UserCheck, X } from '../components/Icons.jsx';
import { PLAN_LABEL } from '../lib/plans.js';
import { TestMode } from '../components/PlanLock.jsx';
import ReleaseNotesAdmin from './ReleaseNotesAdmin.jsx';
import { ADMIN_ROLES, canAdmin, roleLabel } from '../lib/admin.js';
import { PlanMatrix } from './AdminExtra.jsx';
import { Chips } from './Songs.jsx';
import { ChallengesAdmin, FeatureToggles } from './AdminExtra.jsx';
import { TeamSocialLinks } from '../components/TeamRequestForm.jsx';
import MissionsAdmin from './MissionsAdmin.jsx';
import AdminHealth from './AdminHealth.jsx';

/** Painel do administrador: resumo, usuários (planos, bloqueio, admin) e mensagens do suporte. */
export default function Admin() {
  const { plan } = useData();
  const [params] = useSearchParams();
  const tabs = [['health', 'Monitoramento', 'stats'], ['users', 'Usuários', 'users'], ['team', 'Equipe', 'users'], ['approvals', 'Aprovações', 'venues'], ['curation', 'Curadoria', 'charts'],
    ['reports', 'Denúncias', 'reports'], ['feedback', 'Suporte', 'feedback'], ['plans', 'Planos', 'plans'], ['ads', 'Anúncios', 'ads'],
    ['challenges', 'Desafios', 'events'], ['missions', 'Missões', 'events'], ['notes', 'Novidades', 'config'], ['features', 'Recursos', 'config']].filter(([, , p]) => canAdmin(plan, p));
  const [tab, setTab] = useState(params.get('tab') || tabs[0]?.[0]);
  if (!plan?.admin) return <div className="page"><p className="empty">{t('só administradores')}</p></div>;
  const shown = tabs.some(([id]) => id === tab) ? tab : tabs[0]?.[0];
  return (
    <div className="page admin">
      <h2>{t('Administração')}</h2>
      <div className="admin-top"><p className="muted small admin-role ic-row"><ShieldCheck size={14} /> {t('Seu perfil:')} <b>{t(roleLabel(plan.admin_role))}</b></p></div>
      <section className="card"><TestMode /></section>
      <div className="admin-layout">
      <nav className="admin-nav" aria-label={t('Seções da administração')}>
        <Chips value={shown} onChange={setTab} options={tabs.map(([id, l]) => [id, t(l)])} />
      </nav>
      <div className="admin-body">
      {canAdmin(plan, 'stats') && shown !== 'health' && <Stats />}
      {shown === 'health' && <AdminHealth />}
      {shown === 'users' && <Users />}
      {shown === 'team' && <Team />}
      {shown === 'curation' && <><CommunityConfig /><p className="muted small">{t('O tier do clube, os gimmicks, o R!SE e os vídeos são ajustados direto na página de cada música e chart.')}</p></>}
      {shown === 'approvals' && <Approvals />}
      {shown === 'reports' && <Reports />}
      {shown === 'feedback' && <FeedbackList />}
      {shown === 'plans' && <PlansConfig />}
      {shown === 'ads' && <AdsConfig />}
      {shown === 'challenges' && <ChallengesAdmin />}
      {shown === 'missions' && <MissionsAdmin />}
      {shown === 'notes' && <ReleaseNotesAdmin />}
      {shown === 'features' && <FeatureToggles />}
      </div>
      </div>
    </div>
  );
}

function Team() {
  const { plan, session } = useData();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const load = () => rpc('admin_staff').then(setList).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []); // eslint-disable-line
  const setRole = async (m, role) => {
    if (!window.confirm(role ? t('Dar o perfil "{r}" para esta pessoa?', { r: t(roleLabel(role)) }) : t('Tirar esta pessoa da equipe?'))) return;
    try { await rpc('admin_set_role', { p_user: m.id, p_role: role || null }); load(); } catch (e) { setErr(tErr(e.message)); }
  };
  const edit = canAdmin(plan, 'roles');
  const me = session?.user?.id;
  return (
    <div className="admin-team">
      <div className="card admin-roles">
        {ADMIN_ROLES.map(([id, l, d]) => <p key={id} className="small"><b>{t(l)}</b> · <span className="muted">{t(d)}</span></p>)}
        {edit && <p className="tiny muted">{t('Para chamar alguém para a equipe, busque a pessoa em Usuários e escolha o perfil.')}</p>}
      </div>
      {err && <div className="form-err">{err}</div>}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}
      {(list || []).map((m) => (
        <div key={m.id} className="admin-user team-row">
          <span className="q-avatar" style={{ width: 36, height: 36 }}>{m.avatar ? <img src={m.avatar} alt="" referrerPolicy="no-referrer" /> : (m.nickname || m.email || '?').slice(0, 2)}</span>
          <span className="admin-user-info"><b>{m.nickname || m.email}</b><small className="muted">{m.email} · {t('desde {d}', { d: fmtDate(m.since) })}</small></span>
          {edit && m.id !== me
            ? <select value={m.role} onChange={(e) => setRole(m, e.target.value)}>
                <option value="">{t('Fora da equipe')}</option>
                {ADMIN_ROLES.map(([id, l]) => <option key={id} value={id}>{t(l)}</option>)}
              </select>
            : <span className="tag admin-tag">{t(roleLabel(m.role))}</span>}
        </div>
      ))}
    </div>
  );
}

function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => { rpc('admin_stats').then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const items = [['Usuários', s.users], ['Novos (7 dias)', s.new_7d], ['Ativos (7 dias)', s.active_7d], ['Online agora', s.online],
    ['Com conta da Pump', s.linked], ['Plus', s.plus], ['Pro', s.pro], ['Suporte em aberto', s.feedback_open], ['Denúncias em aberto', s.reports_open], ['Bloqueados', s.banned]];
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
  const { plan } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState(u.plan_note || '');
  const run = async (fn, args, confirm) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setErr('');
    try { await rpc(fn, args); await onChange(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const plus = u.plan !== 'free';
  const [give, setGive] = useState('plus');
  const planText = !plus ? t('Grátis')
    : u.plan_source === 'lifetime' ? `${PLAN_LABEL[u.plan]} · ${t('vitalício')}`
      : u.plan_source === 'store' ? `${PLAN_LABEL[u.plan]} · ${t('loja')}`
        : u.plan_source === 'trial' ? `${PLAN_LABEL[u.plan]} · ${t('teste até {d}', { d: fmtDate(u.plan_expires) })}`
        : `${PLAN_LABEL[u.plan]} · ${t('até {d}', { d: fmtDate(u.plan_expires) })}`;
  return (
    <div className={`admin-user ${u.banned ? 'banned' : ''}`}>
      <button className="admin-user-head" onClick={onToggle}>
        <span className="q-avatar" style={{ width: 40, height: 40 }}>{u.avatar ? <img src={u.avatar} alt="" referrerPolicy="no-referrer" /> : (u.nickname || u.email || '?').slice(0, 2)}</span>
        <span className="admin-user-info">
          <b>{u.nickname || t('Sem conta da Pump')}</b>
          <small className="muted">{u.email} · {u.provider}</small>
          <span className="online-tags">
            <span className={`tag ${plus ? 'plus' : ''}`}>{planText}</span>
            {u.admin && <span className="tag admin-tag ic-row"><ShieldCheck size={12} /> {t(roleLabel(u.admin_role) || 'admin')}</span>}
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
            <span>{t('Amigos')}: {u.friends}</span>
            {u.reports > 0 && <span className="warn-text">{t('Denúncias')}: {u.reports}</span>}
          </div>
          {canAdmin(plan, 'plans') && <>
          <div className="rv-label">{t('Liberar plano (cortesia)')}</div>
          <div className="chips">{['plus', 'pro'].map((p) => <button key={p} className={give === p ? 'on' : ''} onClick={() => setGive(p)}>{PLAN_LABEL[p]}</button>)}</div>
          <input placeholder={t('Motivo (opcional), ex.: membro do clube')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          <div className="chips">
            {[[30, '30 dias'], [90, '3 meses'], [365, '1 ano'], [null, 'Vitalício']].map(([d, l]) => (
              <button key={l} disabled={busy} onClick={() => run('admin_set_plan', { p_user: u.id, p_plan: give, p_days: d, p_note: note || null })}>
                <Crown size={13} /> {t(l)}
              </button>
            ))}
            {plus && u.plan_source !== 'store' && (
              <button disabled={busy} onClick={() => run('admin_set_plan', { p_user: u.id, p_plan: 'free' }, t('Remover o plano deste usuário?'))}>{t('Remover plano')}</button>
            )}
          </div>
          </>}
          {canAdmin(plan, 'roles') && <>
            <div className="rv-label">{t('Equipe')}</div>
            <select value={u.admin_role || ''} disabled={busy}
              onChange={(e) => run('admin_set_role', { p_user: u.id, p_role: e.target.value || null }, e.target.value ? t('Dar o perfil "{r}" para esta pessoa?', { r: t(roleLabel(e.target.value)) }) : t('Tirar esta pessoa da equipe?'))}>
              <option value="">{t('Fora da equipe')}</option>
              {ADMIN_ROLES.map(([id, l]) => <option key={id} value={id}>{t(l)}</option>)}
            </select>
          </>}
          <div className="rv-label">{t('Conta')}</div>
          <div className="bm-row">
            {canAdmin(plan, 'ban') && (u.banned
              ? <button className="btn ghost" disabled={busy} onClick={() => run('admin_set_banned', { p_user: u.id, p_banned: false })}><UserCheck size={15} /> {t('Desbloquear')}</button>
              : <button className="btn ghost danger" disabled={busy} onClick={() => run('admin_set_banned', { p_user: u.id, p_banned: true }, t('Bloquear esta conta? A pessoa sai do app e não consegue entrar de novo.'))}><UserX size={15} /> {t('Bloquear')}</button>)}
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
              {(f.contact || f.email) && <a className="btn ghost" href={`mailto:${f.contact || f.email}?subject=${encodeURIComponent(`PIU Stats #${f.id}`)}`}>{t('Responder por e-mail')}</a>}
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

const REASON = { spam: 'Spam', abuse: 'Ofensa ou assédio', cheating: 'Trapaça nas notas', inappropriate: 'Conteúdo impróprio', other: 'Outro' };

function Reports() {
  const { plan } = useData();
  const [status, setStatus] = useState('open');
  const [list, setList] = useState(null);
  const load = () => rpc('admin_reports', { p_status: status }).then(setList).catch(() => setList([]));
  useEffect(() => { setList(null); load(); }, [status]); // eslint-disable-line
  const mark = async (id, s) => { await rpc('admin_report_status', { p_id: id, p_status: s }); load(); };
  const ban = async (r) => {
    if (!window.confirm(t('Bloquear esta conta? A pessoa sai do app e não consegue entrar de novo.'))) return;
    await rpc('admin_set_banned', { p_user: r.reported, p_banned: true }); await mark(r.id, 'done');
  };
  return (
    <>
      <Chips value={status} onChange={setStatus} options={[['open', t('Em aberto')], ['done', t('Resolvidas')], ['all', t('Todas')]]} />
      {list && !list.length && <p className="empty">{t('Nenhuma denúncia aqui.')}</p>}
      <div className="admin-feedback">
        {(list || []).map((r) => (
          <div key={r.id} className={`card fb ${r.status}`}>
            <div className="row-between">
              <span className="tag warn">{t(REASON[r.reason] || r.reason)} #{r.id}</span>
              <small className="muted">{fmtDate(r.at)}</small>
            </div>
            <p className="small"><b>{r.reported_nick || r.reported_email || '—'}</b> · {t('{n} denúncias no total', { n: r.reports_total })}{r.reported_banned ? ` · ${t('bloqueado')}` : ''}</p>
            {r.details && <p className="fb-msg">{r.details}</p>}
            {r.context?.comment && <p className="fb-msg muted">“{r.context.comment}”</p>}
            <small className="muted">{t('Denunciado por')} {r.reporter_nick || '—'}{r.context?.where ? ` · ${r.context.where}` : ''}</small>
            <div className="bm-row">
              {!r.reported_banned && canAdmin(plan, 'ban') && <button className="btn ghost danger" onClick={() => ban(r)}><UserX size={15} /> {t('Bloquear conta')}</button>}
              {r.status === 'open'
                ? <button className="btn" onClick={() => mark(r.id, 'done')}><Check size={15} /> {t('Marcar como resolvida')}</button>
                : <button className="btn ghost" onClick={() => mark(r.id, 'open')}>{t('Reabrir')}</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Configuração dos planos: mostrar a tela, cobrança ativa, plano mínimo de cada recurso e limites. */
function PlansConfig() {
  const { reloadPlan } = useData();
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { rpc('app_config').then(setCfg).catch((e) => setErr(tErr(e.message))); }, []);
  if (!cfg) return <p className="empty">{err || t('Carregando…')}</p>;
  const set = (fn) => { setSaved(false); setCfg((c) => { const n = structuredClone(c); fn(n); return n; }); };
  const save = async () => {
    setErr('');
    try { await rpc('admin_set_config', { p_value: cfg }); setSaved(true); reloadPlan(); } catch (e) { setErr(tErr(e.message)); }
  };
  const regions = Object.keys(cfg.prices || {});
  return (
    <div className="plans-config">
      <label className="check"><input type="checkbox" checked={!!cfg.show_plans} onChange={(e) => set((c) => { c.show_plans = e.target.checked; })} />
        <span><b>{t('Mostrar a tela de planos para todos')}</b><br /><small className="muted">{t('Desligado: só administradores veem a prévia em Ajustes → Ver planos.')}</small></span></label>
      <label className="check"><input type="checkbox" checked={!!cfg.enforce} onChange={(e) => set((c) => { c.enforce = e.target.checked; })} />
        <span><b>{t('Cobrança ativa (aplicar limites e recursos pagos)')}</b><br /><small className="muted">{t('Desligado: todo mundo tem tudo liberado, como na fase de desenvolvimento. Administradores nunca têm limites.')}</small></span></label>

      <label className="check"><input type="checkbox" checked={!!cfg.sales?.enabled} onChange={(e) => set((c) => { c.sales = { ...(c.sales || {}), enabled: e.target.checked }; })} />
        <span><b>{t('Venda de assinaturas ligada (botão Assinar)')}</b><br /><small className="muted">{t('Desligado: os planos aparecem com "Em breve". Ligue só depois de criar as assinaturas no Play Console.')}</small></span></label>

      <h3>{t('Cobrança (RevenueCat)')}</h3>
      <div className="cfg-row">
        <span>{t('Chave pública do app Android (começa com goog_)')}</span>
        <input type="text" maxLength={80} placeholder="goog_…" value={cfg.sales?.rc_key ?? ''}
          onChange={(e) => set((c) => { c.sales = { ...(c.sales || {}), rc_key: e.target.value.trim() }; })} />
      </div>
      <p className="muted small">{t('É a chave pública do SDK (pode ficar no app). A chave secreta e o segredo do webhook ficam só no servidor.')}</p>

      <h3>{t('Produtos na Google Play')}</h3>
      <p className="muted small">{t('Uma assinatura por plano no Play Console, cada uma com dois planos básicos (mensal e anual). Use os mesmos IDs daqui.')}</p>
      <div className="cfg-grid products">
        {[['plus', t('Assinatura do Plus')], ['pro', t('Assinatura do Pro')], ['month', t('Plano básico mensal')], ['year', t('Plano básico anual')]].map(([k, label]) => (
          <FragmentRow key={k} label={label}>
            <input type="text" maxLength={60} value={cfg.sales?.products?.[k] ?? DEFAULT_PRODUCTS[k]}
              onChange={(e) => set((c) => { c.sales = { ...(c.sales || {}) }; c.sales.products = { ...(c.sales.products || {}), [k]: e.target.value.trim() }; })} />
          </FragmentRow>
        ))}
      </div>

      <h3>{t('Teste grátis no cadastro')}</h3>
      <div className="cfg-row">
        <span>{t('Toda conta nova ganha')}</span>
        <select value={cfg.trial_plan || 'plus'} onChange={(e) => set((c) => { c.trial_plan = e.target.value; })}>
          {['plus', 'pro'].map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
        </select>
        <span>{t('por')}</span>
        <input type="number" min="0" max="365" style={{ width: 72 }} value={cfg.trial_days ?? 15}
          onChange={(e) => set((c) => { c.trial_days = Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)); })} />
        <span>{t('dias')}</span>
      </div>
      <p className="muted small">{t('Depois volta sozinha para o plano grátis. Coloque 0 dias para desligar. Cada e-mail ganha o teste uma vez só.')}</p>

      <h3>{t('Recursos por plano')}</h3>
      <PlanMatrix cfg={cfg} set={set} />

      <h3>{t('Preços por região')}</h3>
      <div className="cfg-grid prices">
        <span />{['plus', 'plus_year', 'pro', 'pro_year'].map((k) => <b key={k}>{k.replace('_year', ' / ' + t('ano'))}</b>)}
        {regions.map((r) => (
          <FragmentRow key={r} label={`${r} (${cfg.prices[r].currency})`}>
            {['plus', 'plus_year', 'pro', 'pro_year'].map((k) => (
              <input key={k} type="number" step="0.01" min="0" value={cfg.prices[r][k] ?? ''}
                onChange={(e) => set((c) => { c.prices[r] = { ...c.prices[r], [k]: e.target.value === '' ? null : Number(e.target.value) }; })} />
            ))}
          </FragmentRow>
        ))}
      </div>

      <h3>{t('Preço de lançamento (mensal)')}</h3>
      <div className="cfg-row">
        <span>{t('Vale nos primeiros meses de quem assinar (0 = desligado)')}</span>
        <input type="number" min="0" max="12" style={{ width: 72 }} value={cfg.intro?.months ?? 0}
          onChange={(e) => set((c) => { c.intro = { ...(c.intro || {}), months: Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0)) }; })} />
      </div>
      {(cfg.intro?.months || 0) > 0 && (
        <div className="cfg-grid intro">
          <span /><b>Plus</b><b>Pro</b>
          {regions.map((r) => (
            <FragmentRow key={r} label={`${r} (${cfg.prices[r].currency})`}>
              {['plus', 'pro'].map((k) => (
                <input key={k} type="number" step="0.01" min="0" value={cfg.intro?.prices?.[r]?.[k] ?? ''}
                  onChange={(e) => set((c) => { c.intro = { ...(c.intro || {}) }; c.intro.prices = { ...(c.intro.prices || {}) };
                    c.intro.prices[r] = { ...(c.intro.prices[r] || {}), [k]: e.target.value === '' ? null : Number(e.target.value) }; })} />
              ))}
            </FragmentRow>
          ))}
        </div>
      )}
      <p className="muted small">{t('Na Google Play, crie uma oferta de "preço introdutório" em cada plano básico mensal com o mesmo valor e a mesma duração.')}</p>

      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" onClick={save}>{t('Salvar')}</button>
        {saved && <span className="muted small ic-row"><Check size={14} /> {t('Salvo')}</span>}
      </div>
    </div>
  );
}

/** Admin: ver o app como Grátis, Plus ou Pro (cadeados e limites aplicados só para você). */
function FragmentRow({ label, children }) {
  return <><span className="cfg-label">{label}</span>{children}</>;
}

const newAd = () => ({ id: `ad${Date.now().toString(36)}`, title: '', text: '', url: '', image: '', cta: t('Saiba mais'), active: true, until: null });

/** Anúncios do plano grátis: liga/desliga, rede (anúncios próprios ou AdSense) e os anúncios próprios com o relatório. */
function AdsConfig() {
  const { reloadPlan } = useData();
  const [cfg, setCfg] = useState(null);
  const [stats, setStats] = useState({});
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    rpc('app_config').then(setCfg).catch((e) => setErr(tErr(e.message)));
    rpc('admin_ad_stats', { p_days: 30 }).then((s) => setStats(s || {})).catch(() => {});
  }, []);
  if (!cfg) return <p className="empty">{err || t('Carregando…')}</p>;
  const ads = cfg.ads || {};
  const set = (fn) => { setSaved(false); setCfg((c) => { const n = structuredClone(c); n.ads = n.ads || {}; fn(n.ads); return n; }); };
  const setAd = (i, patch) => set((a) => { a.house[i] = { ...a.house[i], ...patch }; });
  const save = async () => {
    setErr('');
    if (ads.provider === 'adsense' && !/^ca-pub-\d+$/.test(ads.adsense_client || '')) { setErr(t('O ID do AdSense precisa ter o formato ca-pub-0000000000000000.')); return; }
    try { await rpc('admin_set_config', { p_value: cfg }); setSaved(true); reloadPlan(); } catch (e) { setErr(tErr(e.message)); }
  };
  return (
    <div className="plans-config ads-config">
      <label className="check"><input type="checkbox" checked={!!ads.enabled} onChange={(e) => set((a) => { a.enabled = e.target.checked; })} />
        <span><b>{t('Mostrar anúncios no plano grátis')}</b><br /><small className="muted">{t('Plus e Pro nunca veem anúncios. Aparecem no início, na lista de músicas, na página da música e no Tier; nunca na fila, no chat ou nos ajustes.')}</small></span></label>
      <label className="check"><input type="checkbox" checked={!!ads.show_admin} onChange={(e) => set((a) => { a.show_admin = e.target.checked; })} />
        <span><b>{t('Mostrar também para administradores')}</b><br /><small className="muted">{t('Para conferir como fica antes de ligar para todos.')}</small></span></label>

      <h3>{t('Rede de anúncios')}</h3>
      <Chips value={ads.provider || 'house'} onChange={(v) => set((a) => { a.provider = v; })}
        options={[['house', t('Só anúncios próprios')], ['adsense', 'Google AdSense']]} />
      {ads.provider === 'adsense' && (
        <div className="row2">
          <input type="text" placeholder="ca-pub-0000000000000000" value={ads.adsense_client || ''} onChange={(e) => set((a) => { a.adsense_client = e.target.value.trim(); })} />
          <input type="text" placeholder={t('ID do bloco de anúncio')} value={ads.adsense_slot || ''} onChange={(e) => set((a) => { a.adsense_slot = e.target.value.trim(); })} />
          <small className="muted">{t('O AdSense só funciona no site. No app do celular aparecem os anúncios próprios.')}</small>
        </div>
      )}
      <div className="cfg-row">
        <span>{t('Um anúncio a cada quantas músicas na lista')}</span>
        <input type="number" min="4" max="50" value={ads.every_n ?? 12} onChange={(e) => set((a) => { a.every_n = Number(e.target.value) || 12; })} />
      </div>

      <h3>{t('Anúncios próprios')}</h3>
      <p className="muted small">{t('Patrocinadores, fliperamas parceiros, o clube e o Plus. Link interno começa com #/ (ex.: #/planos).')}</p>
      {(ads.house || []).map((a, i) => {
        const st = stats[a.id];
        return (
          <div key={a.id} className="house-ad">
            <div className="cfg-row">
              <label className="check"><input type="checkbox" checked={a.active !== false} onChange={(e) => setAd(i, { active: e.target.checked })} /> <span>{t('Ativo')}</span></label>
              <span className="ad-stats">{st ? t('{v} visualizações · {c} cliques · {p} pessoas (30 dias)', { v: st.views, c: st.clicks, p: st.people }) : t('Sem dados nos últimos 30 dias')}</span>
              <button className="link" onClick={() => set((x) => { x.house.splice(i, 1); })} title={t('Remover')}><X size={14} /></button>
            </div>
            <input type="text" placeholder={t('Título')} value={a.title || ''} onChange={(e) => setAd(i, { title: e.target.value })} />
            <textarea rows={2} placeholder={t('Texto')} value={a.text || ''} onChange={(e) => setAd(i, { text: e.target.value })} />
            <div className="row2">
              <input type="text" placeholder={t('Link (https://… ou #/planos)')} value={a.url || ''} onChange={(e) => setAd(i, { url: e.target.value.trim() })} />
              <input type="text" placeholder={t('Texto do botão')} value={a.cta || ''} onChange={(e) => setAd(i, { cta: e.target.value })} />
              <input type="text" placeholder={t('Imagem (URL, opcional)')} value={a.image || ''} onChange={(e) => setAd(i, { image: e.target.value.trim() })} />
              <label className="small muted">{t('Até')} <input type="date" value={a.until ? a.until.slice(0, 10) : ''} onChange={(e) => setAd(i, { until: e.target.value ? `${e.target.value}T23:59:59-03:00` : null })} /></label>
            </div>
          </div>
        );
      })}
      <button className="btn ghost" onClick={() => set((a) => { a.house = [...(a.house || []), newAd()]; })}>{t('Adicionar anúncio')}</button>

      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" onClick={save}>{t('Salvar')}</button>
        {saved && <span className="muted small ic-row"><Check size={14} /> {t('Salvo')}</span>}
      </div>
    </div>
  );
}

/** Aprovações: fliperamas e times pedidos pelos membros, votações de tier abertas e regras da votação. */
function Approvals() {
  const [venues, setVenues] = useState(null);
  const [teams, setTeams] = useState(null);
  const [votes, setVotes] = useState([]);
  const [err, setErr] = useState('');
  const load = () => {
    rpc('admin_venue_requests', { p_status: 'pending' }).then(setVenues).catch((e) => setErr(tErr(e.message)));
    rpc('admin_teams', { p_status: 'pending' }).then(setTeams).catch((e) => setErr(tErr(e.message)));
    rpc('tier_proposals_list', { p_charts: null }).then((l) => setVotes(l.filter((p) => p.status === 'open'))).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  return (
    <div className="approvals">
      {err && <div className="form-err">{err}</div>}
      <h3>{t('Fliperamas')}</h3>
      {venues && !venues.length && <p className="muted small">{t('Nenhum pedido esperando.')}</p>}
      {(venues || []).map((r) => (r.kind === 'remove' ? <VenueRemovalReview key={r.id} r={r} onDone={load} /> : <VenueReview key={r.id} r={r} onDone={load} />))}
      <InactiveVenues />

      <h3>{t('Times')}</h3>
      {teams && !teams.length && <p className="muted small">{t('Nenhum pedido esperando.')}</p>}
      {(teams || []).map((x) => <TeamReview key={x.id} x={x} onDone={load} />)}

      <h3>{t('Votações de tier abertas')}</h3>
      {!votes.length && <p className="muted small">{t('Nenhuma votação aberta.')}</p>}
      {votes.map((p) => <ProposalCard key={p.id} p={p} onChange={load} showChart />)}
    </div>
  );
}

function VenueReview({ r, onDone }) {
  const [f, setF] = useState({ name: r.name, city: r.city, address: r.address || '', lat: r.latitude ?? '', lng: r.longitude ?? '',
    machines: r.machines, machine_names: r.machine_names || '', note: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const review = async (approve) => {
    setErr('');
    const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
    try {
      await rpc('admin_review_venue', { p_id: r.id, p_approve: approve, p_name: f.name, p_city: f.city, p_address: f.address,
        p_lat: num(f.lat), p_lng: num(f.lng), p_machines: Number(f.machines) || 1, p_machine_names: f.machine_names, p_note: f.note });
      onDone();
    } catch (e) { setErr(tErr(e.message)); }
  };
  const maps = f.lat !== '' && f.lng !== '' ? `https://www.google.com/maps?q=${f.lat},${f.lng}` : `https://www.google.com/maps/search/${encodeURIComponent(`${f.name} ${f.address} ${f.city}`)}`;
  return (
    <div className="card review-card">
      <div className="small muted">{t('Pedido de {who} · {when}', { who: r.nickname || t('Jogador'), when: timeAgo(r.created_at) })}</div>
      <div className="venue-form">
        <input value={f.name} onChange={set('name')} placeholder={t('Nome do lugar')} />
        <div className="row2"><input value={f.city} onChange={set('city')} placeholder={t('Cidade')} /><input type="number" min={1} max={20} value={f.machines} onChange={set('machines')} /></div>
        <input value={f.address} onChange={set('address')} placeholder={t('Endereço')} />
        <div className="row2"><input value={f.lat} onChange={set('lat')} placeholder="Latitude" /><input value={f.lng} onChange={set('lng')} placeholder="Longitude" /></div>
        <input value={f.machine_names} onChange={set('machine_names')} placeholder={t('Nome das máquinas (opcional, separados por vírgula)')} />
        {r.note && <p className="small">“{r.note}”</p>}
        <a className="link small" href={maps} target="_blank" rel="noreferrer">{t('Conferir no mapa')}</a>
        <input value={f.note} onChange={set('note')} placeholder={t('Recado para quem pediu (opcional)')} />
      </div>
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" onClick={() => review(true)}><Check size={14} /> {t('Aprovar')}</button>
        <button className="btn ghost" onClick={() => review(false)}><X size={14} /> {t('Recusar')}</button>
      </div>
    </div>
  );
}

function VenueRemovalReview({ r, onDone }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const review = async (approve) => {
    setErr('');
    try { await rpc('admin_review_venue_removal', { p_id: r.id, p_approve: approve, p_note: note }); onDone(); } catch (e) { setErr(tErr(e.message)); }
  };
  return (
    <div className="card review-card removal">
      <div className="small muted">{t('Pedido de exclusão de {who} · {when}', { who: r.nickname || t('Jogador'), when: timeAgo(r.created_at) })}</div>
      <div><b>{r.name}</b> · {r.city}{r.target_slug && <> · <Link to={`/fila/${r.target_slug}`}>{t('ver fila')}</Link></>}</div>
      {r.note && <p className="small">“{r.note}”</p>}
      {r.queue_entries > 0 && <p className="small warn">{t('Tem {n} pessoa(s) na fila agora; ao tirar da lista, a fila é esvaziada.', { n: r.queue_entries })}</p>}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Recado para quem pediu (opcional)')} />
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" onClick={() => review(true)}><Check size={14} /> {t('Tirar da lista')}</button>
        <button className="btn ghost" onClick={() => review(false)}><X size={14} /> {t('Manter')}</button>
      </div>
    </div>
  );
}

/** Fliperamas fora da lista (excluídos por pedido): o admin pode reativar. */
function InactiveVenues() {
  const [list, setList] = useState([]);
  const load = () => rpc('admin_inactive_venues').then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!list.length) return null;
  const reactivate = async (id) => { await rpc('admin_set_venue_active', { p_venue: id, p_active: true }).catch(() => {}); load(); };
  return (
    <details className="small inactive-venues">
      <summary>{t('Fora da lista ({n})', { n: list.length })}</summary>
      {list.map((v) => (
        <div key={v.id} className="row-between"><span>{v.name} · {v.city}</span><button className="link" onClick={() => reactivate(v.id)}>{t('Reativar')}</button></div>
      ))}
    </details>
  );
}

function TeamReview({ x, onDone }) {
  const [f, setF] = useState({ name: x.name, tag: x.tag || '', note: '' });
  const [err, setErr] = useState('');
  const dropLogo = async () => {
    setErr('');
    try { await rpc('admin_set_team_media', { p_id: x.id, p_logo: null, p_instagram: x.instagram, p_socials: x.socials || {} }); onDone(); } catch (e) { setErr(tErr(e.message)); }
  };
  const review = async (approve) => {
    setErr('');
    try { await rpc('admin_review_team', { p_id: x.id, p_approve: approve, p_name: f.name, p_tag: f.tag, p_note: f.note }); onDone(); } catch (e) { setErr(tErr(e.message)); }
  };
  return (
    <div className="card review-card">
      <div className="small muted">{t('Pedido de {who} · {when}', { who: x.nickname || t('Jogador'), when: timeAgo(x.created_at) })}{x.city ? ` · ${x.city}` : ''}</div>
      <div className="tq-review">
        {x.logo_url ? <a href={x.logo_url} target="_blank" rel="noopener noreferrer"><img className="tq-review-logo" src={x.logo_url} alt={t('Logo do time')} /></a>
          : <span className="tq-review-logo ph muted tiny">{t('Sem logo')}</span>}
        <div className="tq-review-info">
          <TeamSocialLinks team={x} />
          {x.about && <p className="small">{x.about}</p>}
          {x.contact && <p className="small muted">{t('Contato')}: {x.contact}</p>}
          {x.logo_url && <button className="link muted small" onClick={dropLogo}>{t('Tirar o logo')}</button>}
        </div>
      </div>
      <div className="team-form">
        <div className="row2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('Nome do time')} />
          <input value={f.tag} maxLength={5} onChange={(e) => setF({ ...f, tag: e.target.value.toUpperCase() })} placeholder={t('Sigla')} />
        </div>
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t('Recado para quem pediu (opcional)')} />
      </div>
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" onClick={() => review(true)}><Check size={14} /> {t('Aprovar')}</button>
        <button className="btn ghost" onClick={() => review(false)}><X size={14} /> {t('Recusar')}</button>
      </div>
    </div>
  );
}

/** Regras da votação de tier: prazo e mínimo de votos. */
function CommunityConfig() {
  const { reloadPlan } = useData();
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { rpc('app_config').then(setCfg).catch((e) => setErr(tErr(e.message))); }, []);
  if (!cfg) return null;
  const c = cfg.community || {};
  const set = (k, v) => { setSaved(false); setCfg({ ...cfg, community: { ...c, [k]: v } }); };
  const save = async () => {
    try { await rpc('admin_set_config', { p_value: cfg }); setSaved(true); reloadPlan(); } catch (e) { setErr(tErr(e.message)); }
  };
  return (
    <div className="card">
      <h3>{t('Regras da votação de tier')}</h3>
      <div className="cfg-row"><span>{t('Horas que a votação fica aberta')}</span>
        <input type="number" min={1} max={336} value={c.tier_vote_hours ?? 48} onChange={(e) => set('tier_vote_hours', Number(e.target.value) || 48)} /></div>
      <div className="cfg-row"><span>{t('Mínimo de votos para valer')}</span>
        <input type="number" min={1} max={50} value={c.tier_vote_min ?? 3} onChange={(e) => set('tier_vote_min', Number(e.target.value) || 3)} /></div>
      <p className="muted tiny">{t('Aprova quando há mais votos a favor do que contra e o total chega ao mínimo. Votos só de quem passou o chart.')}</p>
      <h4 className="cfg-sub">{t('Quem é avisado quando abre uma votação')}</h4>
      <div className="cfg-row"><span>{t('Avisar')}</span>
        <select value={c.tier_notify ?? 'cleared'} onChange={(e) => set('tier_notify', e.target.value)}>
          <option value="cleared">{t('Quem passou o chart')}</option>
          <option value="reviewers">{t('Só quem avaliou o chart')}</option>
          <option value="off">{t('Ninguém')}</option>
        </select></div>
      {(c.tier_notify ?? 'cleared') === 'cleared' && (
        <label className="cfg-row"><span>{t('Incluir quem passou o mesmo chart na outra versão (Phoenix / Phoenix 2)')}</span>
          <input type="checkbox" checked={c.tier_notify_p1 ?? true} onChange={(e) => set('tier_notify_p1', e.target.checked)} /></label>
      )}
      {(c.tier_notify ?? 'cleared') !== 'off' && (
        <>
          <div className="cfg-row"><span>{t('Só quem sincronizou nos últimos (dias, 0 = todos)')}</span>
            <input type="number" min={0} max={365} value={c.tier_notify_days ?? 30} onChange={(e) => set('tier_notify_days', Math.max(0, Number(e.target.value) || 0))} /></div>
          <div className="cfg-row"><span>{t('Máximo de avisos por votação')}</span>
            <input type="number" min={1} max={5000} value={c.tier_notify_max ?? 300} onChange={(e) => set('tier_notify_max', Number(e.target.value) || 300)} /></div>
          <p className="muted tiny">{t('Quem avaliou o chart sempre recebe. Os mais ativos vêm primeiro quando passa do máximo. Votar continua valendo só para quem passou o chart nesta versão.')}</p>
        </>
      )}
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row"><button className="btn" onClick={save}>{t('Salvar')}</button>{saved && <span className="muted small ic-row"><Check size={14} /> {t('Salvo')}</span>}</div>
    </div>
  );
}

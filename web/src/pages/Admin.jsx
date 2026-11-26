import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { fmtDate, timeAgo } from '../components/ui.jsx';
import { fmtNum, t, tErr } from '../lib/i18n.js';
import { Check, Crown, ShieldCheck, ShieldOff, UserX, UserCheck, X } from '../components/Icons.jsx';
import { FEATURES, LIMITS, PLAN_LABEL, PLAN_ORDER } from '../lib/plans.js';
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
      <Chips value={tab} onChange={setTab} options={[['users', t('Usuários')], ['reports', t('Denúncias')], ['feedback', t('Suporte')], ['plans', t('Planos')], ['ads', t('Anúncios')]]} />
      {tab === 'users' && <Users />}
      {tab === 'reports' && <Reports />}
      {tab === 'feedback' && <FeedbackList />}
      {tab === 'plans' && <PlansConfig />}
      {tab === 'ads' && <AdsConfig />}
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
            <span>{t('Amigos')}: {u.friends}</span>
            {u.reports > 0 && <span className="warn-text">{t('Denúncias')}: {u.reports}</span>}
          </div>
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

const REASON = { spam: 'Spam', abuse: 'Ofensa ou assédio', cheating: 'Trapaça nas notas', inappropriate: 'Conteúdo impróprio', other: 'Outro' };

function Reports() {
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
              {!r.reported_banned && <button className="btn ghost danger" onClick={() => ban(r)}><UserX size={15} /> {t('Bloquear conta')}</button>}
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

      <h3>{t('Plano mínimo de cada recurso')}</h3>
      {FEATURES.map((f) => (
        <div key={f.id} className="cfg-row">
          <span>{t(f.label)}{f.soon && <em className="soon"> · {t('em breve')}</em>}</span>
          <select value={cfg.features?.[f.id] || 'free'} onChange={(e) => set((c) => { c.features = { ...(c.features || {}), [f.id]: e.target.value }; })}>
            {PLAN_ORDER.map((p) => <option key={p} value={p}>{p === 'free' ? t('Grátis') : PLAN_LABEL[p]}</option>)}
          </select>
        </div>
      ))}

      <h3>{t('Limites por plano')}</h3>
      <p className="muted small">{t('Deixe em branco para sem limite.')}</p>
      <div className="cfg-grid">
        <span />{PLAN_ORDER.map((p) => <b key={p}>{p === 'free' ? t('Grátis') : PLAN_LABEL[p]}</b>)}
        {LIMITS.map((l) => (
          <FragmentRow key={l.id} label={t(l.label)}>
            {PLAN_ORDER.map((p) => (
              <input key={p} type="number" min="0" value={cfg.limits?.[p]?.[l.id] ?? ''}
                onChange={(e) => set((c) => { c.limits = c.limits || {}; c.limits[p] = { ...(c.limits[p] || {}) }; if (e.target.value === '') delete c.limits[p][l.id]; else c.limits[p][l.id] = Number(e.target.value); })} />
            ))}
          </FragmentRow>
        ))}
      </div>

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

      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" onClick={save}>{t('Salvar')}</button>
        {saved && <span className="muted small ic-row"><Check size={14} /> {t('Salvo')}</span>}
      </div>
    </div>
  );
}

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

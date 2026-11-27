import { startTour } from '../lib/tour.js';
import CountryPicker from '../components/CountryPicker.jsx';
import { SocialsEditor } from '../components/Socials.jsx';
import { useData } from '../App.jsx';
import { usePrefs } from '../lib/prefs.js';
import { Chips } from './Songs.jsx';
import PiuConnect, { QuickSync } from '../components/PiuConnect.jsx';
import { timeAgo } from '../components/ui.jsx';
import { Link } from 'react-router-dom';
import { Crown, Heart, Lock, Logo, ShieldCheck, Sparkles, Trash2 } from '../components/Icons.jsx';
import { entitlements, isOn, PLAN_LABEL } from '../lib/plans.js';
import { rpc } from '../lib/api.js';
import { useEffect, useState } from 'react';
import { signOut } from '../lib/auth.js';
import { canAdmin } from '../lib/admin.js';
import { VERSIONS } from '../lib/piu.js';
import { locale, t, tErr, tn } from '../lib/i18n.js';
import LangPicker from '../components/LangPicker.jsx';
import Feedback from '../components/Feedback.jsx';
import TeamPicker from '../components/TeamPicker.jsx';
import { NotesCard } from '../components/ReleaseNotes.jsx';
import { QuizCard } from '../components/QuizModal.jsx';
import { TestMode } from '../components/PlanLock.jsx';

const GROUPS = [['sync', 'Sincronização'], ['perfil', 'Seu perfil'], ['app', 'App'], ['ajuda', 'Ajuda'], ['privacidade', 'Privacidade']];

function Group({ id, title, children }) {
  return (
    <div className="set-group" id={`set-${id}`}>
      <h2 className="set-group-title">{t(title)}</h2>
      {children}
    </div>
  );
}

export default function Settings() {
  const { data, version, reload, session, plan } = useData();
  const [prefs, setPrefs] = usePrefs();
  const go = (id) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page settings">
      <AccountCard />
      {canAdmin(plan, 'users') && <NewUsersCard />}

      <nav className="set-nav" aria-label={t('Seções dos ajustes')}>
        {GROUPS.map(([id, l]) => <button key={id} type="button" onClick={() => go(id)}>{t(l)}</button>)}
      </nav>

      <Group id="sync" title="Sincronização">
        <section className="card">
          <h3>{t('Sincronizar com a Pump It Up')}</h3>
          <p className="muted small">{t('Última sincronização da {v}: {when}', { v: VERSIONS[version].name, when: timeAgo(data.lastSync) })}</p>
          {plan?.view_as ? <p className="muted small">{t('Sincronização desativada enquanto você vê o app como outra pessoa.')}</p> : <>
          <QuickSync onDone={() => reload()} />
          <AutoSync />
          </>}
          <details className="other-login">
            <summary className="small">{t('Entrar com outra conta AM.PASS')}</summary>
            <PiuConnect compact onDone={() => reload()} />
          </details>
        </section>
      </Group>

      <Group id="perfil" title="Seu perfil">
        <QuizCard />
        <CountryPicker />
        {isOn(plan, 'teams') && <TeamPicker userId={session?.user?.id} />}
        <SocialsEditor />
      </Group>

      <Group id="app" title="App">
        <NotesCard />
        <section className="card">
          <h3>{t('Idioma e exibição')}</h3>
          <LangPicker compact />
          <p className="muted small set-sub">{t('Tamanho da nota sobre a capa da música na tela de Tier')}</p>
          <Chips value={prefs.tierGrade} onChange={(v) => setPrefs({ tierGrade: v })}
            options={[['sm', t('Pequena')], ['md', t('Média')], ['lg', t('Grande')]]} />
          <p className="muted small">{t('Tamanho das capas no Tier: menor mostra mais músicas por linha')}</p>
          <Chips value={prefs.tierSize || 'md'} onChange={(v) => setPrefs({ tierSize: v })}
            options={[['sm', t('Pequenas')], ['md', t('Médias')], ['lg', t('Grandes')]]} />
          <label className="check legacy-pref">
            <input type="checkbox" checked={!!prefs.legacyP1} onChange={(e) => setPrefs({ legacyP1: e.target.checked })} />
            <span>
              <b>{t('Mostrar recordes legados da Phoenix na Phoenix 2')}</b><br />
              <small className="muted">{t('Nos charts que você ainda não jogou na Phoenix 2, mostra a nota da Phoenix marcada como P1. Ela não entra nas contagens, filtros de grade nem no PUMBILITY da Phoenix 2.')}</small>
            </span>
          </label>
          <label className="check legacy-pref">
            <input type="checkbox" checked={prefs.friendOnline !== false} onChange={(e) => setPrefs({ friendOnline: e.target.checked })} />
            <span>
              <b>{t('Avisar quando um amigo ficar online')}</b><br />
              <small className="muted">{t('Um aviso sobe no canto da tela quando um amigo abre o PIU Stats enquanto você está com ele aberto.')}</small>
            </span>
          </label>
        </section>
      </Group>

      <Group id="ajuda" title="Ajuda">
        <section className="card">
          <h3>{t('Ajuda e feedback')}</h3>
          <p className="muted small">{t('Encontrou um problema, tem uma dúvida ou uma ideia? Mande para o suporte.')}</p>
          <Feedback />
          <div className="set-row">
            <span><b className="ic-row"><Sparkles size={15} /> {t('Tutorial guiado')}</b><small className="muted">{t('Um tour rápido pelas telas principais do app.')}</small></span>
            <button type="button" className="btn ghost" onClick={startTour}>{t('Ver tutorial')}</button>
          </div>
        </section>
      </Group>

      <Group id="privacidade" title="Privacidade">
        <PrivateStats />
        <BlockedUsers />
        <section className="card">
          <h3>{t('Privacidade e dados')}</h3>
          <div className="bm-row">
            <Link className="btn ghost" to="/privacidade"><Lock size={15} /> {t('Política de privacidade')}</Link>
          </div>
          <DeleteAccount />
        </section>
      </Group>

      <p className="muted tiny legal-note">{t('Pump It Up é marca da Andamiro. Projeto independente, sem vínculo com a Andamiro.')}</p>

      <footer className="signature">
        <Logo size={22} />
        <div>
          <b>PIU Stats</b>
          <span>{t('Desenvolvido por')} <b className="sig-name">Carluci</b> <Heart size={12} className="sig-heart" aria-hidden="true" /></span>
        </div>
      </footer>
    </div>
  );
}

/** Equipe: quem criou conta nos últimos dias e o liga/desliga do alerta de conta nova. */
function NewUsersCard() {
  const [d, setD] = useState(null);
  const load = () => rpc('admin_new_users', { p_days: 7 }).then(setD).catch(() => setD(false));
  useEffect(() => { load(); }, []);
  if (d === false) return null;
  const flip = async () => { await rpc('admin_set_new_user_alert', { p_on: !d.notify }); load(); };
  return (
    <section className="card set-newusers">
      <div className="row-between">
        <h3 className="ic-row"><ShieldCheck size={17} /> {t('Novos usuários')}</h3>
        <Link to="/admin?tab=users" className="link small">{t('Ver todos')}</Link>
      </div>
      {!d ? <p className="muted small">{t('Carregando…')}</p> : <>
        <div className="nu-stats">
          <div><b>{d.day}</b><small className="muted">{t('nas últimas 24 h')}</small></div>
          <div><b>{d.week}</b><small className="muted">{t('nos últimos 7 dias')}</small></div>
        </div>
        {d.list.length > 0 && (
          <ul className="nu-list">
            {d.list.slice(0, 5).map((u) => (
              <li key={u.id}><span>{u.nickname || u.email}{u.nickname ? <small className="muted"> · {u.email}</small> : null}</span><small className="muted">{timeAgo(u.created_at)}</small></li>
            ))}
          </ul>
        )}
        {!d.list.length && <p className="muted small">{t('Ninguém criou conta nos últimos 7 dias.')}</p>}
        <label className="check legacy-pref">
          <input type="checkbox" checked={!!d.notify} onChange={flip} />
          <span><b>{t('Alertar quando alguém criar conta')}</b><br />
            <small className="muted">{t('Aparece um aviso na tela e nas notificações (e no aparelho, se os avisos estiverem permitidos).')}</small></span>
        </label>
      </>}
    </section>
  );
}

/** Dias que faltam até uma data (arredonda para cima; 0 = termina hoje). */
const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso) - new Date()) / 86400000));

/** Topo dos ajustes: quem está logado, o plano (com o teste grátis em destaque) e as ações da conta. */
function AccountCard() {
  const { data, reload, session, plan } = useData();
  const ent = entitlements(plan);
  const p = data.profile;
  const paid = plan?.plan && plan.plan !== 'free';
  const trial = paid && plan.source === 'trial' && plan.expires_at;
  const left = trial ? daysLeft(plan.expires_at) : null;
  const total = Number(plan?.config?.trial_days) || 15;
  return (
    <section className="card set-account">
      <div className="set-id">
        <span className="q-avatar" style={{ width: 52, height: 52 }}>{p?.avatar_url ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" /> : (p?.nickname || session.email || '?').slice(0, 2)}</span>
        <div className="set-id-txt">
          <b>{p?.nickname || t('Sem conta da Pump')}</b>
          <small className="muted">{session.email}</small>
          <span className={`tag ${paid ? 'plus' : ''}`}>{paid ? <><Crown size={12} /> {PLAN_LABEL[plan.plan]}{trial ? ` · ${t('teste grátis')}` : ''}</> : t('Plano grátis')}</span>
        </div>
      </div>

      {trial && (
        <div className={`set-trial ${left <= 3 ? 'ending' : ''}`} role="status">
          <b>{left === 0 ? t('Seu teste grátis do {p} termina hoje', { p: PLAN_LABEL[plan.plan] })
            : tn(left, 'Falta {n} dia do seu teste grátis do {p}', 'Faltam {n} dias do seu teste grátis do {p}', { p: PLAN_LABEL[plan.plan] })}</b>
          <span className="set-trial-bar"><i style={{ width: `${Math.min(100, Math.max(4, ((total - left) / total) * 100))}%` }} /></span>
          <small className="muted">{t('Termina em {d}. Depois sua conta volta para o plano grátis, sem cobrança.', { d: fmtDay(plan.expires_at) })}</small>
          {ent.showPlans && <Link to="/planos" className="link small">{t('Continuar no {p} depois do teste', { p: PLAN_LABEL[plan.plan] })}</Link>}
        </div>
      )}
      {paid && !trial && (
        <p className="muted small">{plan.source === 'lifetime' ? t('Acesso vitalício.') : plan.expires_at ? t('Ativo até {d}.', { d: fmtDay(plan.expires_at) }) : t('Assinatura ativa.')}</p>
      )}

      <div className="bm-row set-actions">
        {ent.showPlans && <Link className="btn ghost" to={paid ? '/assinatura' : '/planos'}><Crown size={15} /> {paid ? t('Minha assinatura') : t('Ver planos')}</Link>}
        {plan?.admin && <Link className="btn ghost" to="/admin"><ShieldCheck size={15} /> {t('Administração')}</Link>}
        <button className="btn ghost" onClick={() => reload()}>{t('Recarregar dados')}</button>
        <button className="btn ghost" onClick={signOut}>{t('Sair')}</button>
      </div>
      {plan?.admin && <TestMode compact />}
    </section>
  );
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

/** Perfil privado: esconde de todo mundo (amigos também) as estatísticas que o app gera. */
function PrivateStats() {
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc('my_privacy').then((r) => setOn(!!r?.private_stats)).catch(() => setOn(false)); }, []);
  if (on == null) return null;
  const flip = async () => {
    setBusy(true);
    try { await rpc('set_private_stats', { p_on: !on }); setOn(!on); } catch { /* segue */ }
    setBusy(false);
  };
  return (
    <section className="card">
      <h3 className="ic-row"><Lock size={17} /> {t('Perfil privado')}</h3>
      <label className="check legacy-pref">
        <input type="checkbox" checked={on} disabled={busy} onChange={flip} />
        <span><b>{t('Ocultar minhas estatísticas, até dos amigos')}</b><br />
          <small className="muted">{t('Some para os outros: notas e recordes, jogadas, top 50, notas e placas, passes por nível, estilo de jogo, comparação, rival, pontos e selos das missões e avisos dos seus recordes.')}</small><br />
          <small className="muted">{t('Continua visível o que o próprio jogo mostra (nick, foto, título e PUMBILITY), além de bandeira, time e redes sociais. Você continua vendo tudo seu.')}</small></span>
      </label>
    </section>
  );
}

function BlockedUsers() {
  const [list, setList] = useState(null);
  const load = () => rpc('my_blocks').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (!list || !list.length) return null;
  return (
    <section className="card">
      <h3>{t('Jogadores bloqueados')}</h3>
      {list.map((p) => (
        <div key={p.id} className="row-between blocked-row">
          <span>{p.nickname || t('Jogador')}</span>
          <button className="btn ghost" onClick={async () => { await rpc('block_user', { p_user: p.id, p_block: false }); load(); }}>{t('Desbloquear')}</button>
        </div>
      ))}
    </section>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await rpc('delete_my_account', { p_confirm: text }); await signOut(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  if (!open) return <button className="link small danger ic-row delete-link" onClick={() => setOpen(true)}><Trash2 size={13} /> {t('Excluir minha conta')}</button>;
  return (
    <div className="delete-box">
      <p className="small">{t('Isso apaga sua conta do PIU Stats e todos os dados ligados a ela (notas importadas, amigos, mensagens, avaliações). Não dá para desfazer. Sua conta da Pump It Up não é afetada.')}</p>
      <input placeholder={t('Digite EXCLUIR para confirmar')} value={text} onChange={(e) => setText(e.target.value)} />
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn danger" disabled={busy || text.trim().toUpperCase() !== 'EXCLUIR'} onClick={go}>{t('Excluir definitivamente')}</button>
        <button className="btn ghost" onClick={() => { setOpen(false); setText(''); }}>{t('Cancelar')}</button>
      </div>
    </div>
  );
}

/** Liga/desliga a sincronização automática feita pelo servidor (some se o servidor ainda não tiver o recurso). */
function AutoSync() {
  const { plan } = useData();
  const [st, setSt] = useState(null);
  const load = () => rpc('my_auto_sync').then(setSt).catch(() => setSt(false));
  useEffect(() => { load(); }, []);
  if (!st) return null;
  const allowed = entitlements(plan).can('auto_sync');
  const toggle = async () => { await rpc('set_auto_sync', { p_on: !st.on }); load(); };
  return (
    <div className="auto-sync">
      <label className="check">
        <input type="checkbox" checked={!!st.on && allowed} disabled={!allowed} onChange={toggle} />
        <span>
          <b>{t('Sincronização automática')}</b>{!allowed && <> · <Crown size={12} /> Pro</>}<br />
          <small className="muted">
            {!st.has_session ? t('Faça uma sincronização com a senha AM.PASS para ativar.')
              : st.error === 'session_expired' ? t('A sessão do piugame expirou. Entre de novo com a sua senha AM.PASS.')
                : t('O PIU Stats atualiza suas notas sozinho algumas vezes por dia.')}
            {st.last && <> · {t('última tentativa {when}', { when: timeAgo(st.last) })}</>}
          </small>
        </span>
      </label>
    </div>
  );
}

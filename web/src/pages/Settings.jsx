import { useData } from '../App.jsx';
import { usePrefs } from '../lib/prefs.js';
import { Chips } from './Songs.jsx';
import PiuConnect, { QuickSync } from '../components/PiuConnect.jsx';
import { fmtDate, timeAgo } from '../components/ui.jsx';
import { Link } from 'react-router-dom';
import { Crown, Lock, ShieldCheck, Trash2 } from '../components/Icons.jsx';
import { entitlements, PLAN_LABEL } from '../lib/plans.js';
import { rpc } from '../lib/api.js';
import { useEffect, useState } from 'react';
import { signOut } from '../lib/auth.js';
import { VERSIONS } from '../lib/piu.js';
import { t, tErr } from '../lib/i18n.js';
import LangPicker from '../components/LangPicker.jsx';
import Feedback from '../components/Feedback.jsx';
import TeamPicker from '../components/TeamPicker.jsx';

export default function Settings() {
  const { data, version, reload, session, plan } = useData();
  const [prefs, setPrefs] = usePrefs();
  const ent = entitlements(plan);

  return (
    <div className="page settings">
      <section className="card">
        <h3>{t('Sincronizar com a Pump It Up')}</h3>
        <p className="muted small">{t('Última sincronização da {v}: {when}', { v: VERSIONS[version].name, when: timeAgo(data.lastSync) })}</p>
        <QuickSync onDone={() => reload()} />
        <AutoSync />
        <details className="other-login">
          <summary className="small">{t('Entrar com outra conta AM.PASS')}</summary>
          <PiuConnect compact onDone={() => reload()} />
        </details>
      </section>

      <TeamPicker userId={session?.user?.id} />

      <section className="card plan-card">
        <div className="row-between">
          <h3 className="ic-row">{plan?.plan && plan.plan !== 'free' ? <><Crown size={18} /> StepClub {PLAN_LABEL[plan.plan]}</> : t('Plano grátis')}</h3>
          {plan?.admin && <Link className="btn ghost" to="/admin"><ShieldCheck size={15} /> {t('Administração')}</Link>}
        </div>
        <p className="muted small">
          {plan?.plan && plan.plan !== 'free'
            ? (plan.source === 'lifetime' ? t('Acesso vitalício.') : plan.expires_at ? t('Ativo até {d}.', { d: fmtDate(plan.expires_at) }) : t('Assinatura ativa.'))
            : t('Os recursos do StepClub+ chegam em breve.')}
        </p>
        {ent.showPlans && <Link className="btn ghost" to="/planos"><Crown size={15} /> {t('Ver planos')}</Link>}
      </section>

      <section className="card">
        <h3>{t('Idioma')}</h3>
        <LangPicker compact />
      </section>

      <section className="card">
        <h3>{t('Exibição')}</h3>
        <p className="muted small">{t('Tamanho da nota sobre a capa da música na tela de Tier')}</p>
        <Chips value={prefs.tierGrade} onChange={(v) => setPrefs({ tierGrade: v })}
          options={[['sm', t('Pequena')], ['md', t('Média')], ['lg', t('Grande')]]} />
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
            <small className="muted">{t('Um aviso sobe no canto da tela quando um amigo abre o StepClub enquanto você está com ele aberto.')}</small>
          </span>
        </label>
      </section>

      <section className="card">
        <h3>{t('Ajuda e feedback')}</h3>
        <p className="muted small">{t('Encontrou um problema, tem uma dúvida ou uma ideia? Mande para o suporte.')}</p>
        <Feedback />
      </section>

      <section className="card">
        <h3>{t('Conta StepClub')}</h3>
        <p className="muted">{t('Conectado como')} <b>{session.email}</b></p>
        <div className="bm-row">
          <button className="btn ghost" onClick={() => reload()}>{t('Recarregar dados')}</button>
          <button className="btn ghost" onClick={signOut}>{t('Sair')}</button>
        </div>
      </section>

      <BlockedUsers />

      <section className="card">
        <h3>{t('Privacidade')}</h3>
        <div className="bm-row">
          <Link className="btn ghost" to="/privacidade"><Lock size={15} /> {t('Política de privacidade')}</Link>
        </div>
        <DeleteAccount />
      </section>

      <section className="card muted small">
        <p>{t('Catálogo de charts e dificuldades:')} <a href="https://piuscores.arroweclip.se" target="_blank" rel="noreferrer">PIU Scores</a>.{' '}
          {t('Estilo dos charts: anotações do')} <a href="https://www.piucenter.com" target="_blank" rel="noreferrer">piucenter</a>.{' '}
          {t('Imagens de capa, grades, plates e bolinhas: © Andamiro, carregadas direto do piugame.com.')}{' '}
          {t('Projeto independente, sem vínculo com a Andamiro.')}</p>
      </section>
    </div>
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
      <p className="small">{t('Isso apaga sua conta do StepClub e todos os dados ligados a ela (notas importadas, amigos, mensagens, avaliações). Não dá para desfazer. Sua conta da Pump It Up não é afetada.')}</p>
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
                : t('O StepClub atualiza suas notas sozinho algumas vezes por dia.')}
            {st.last && <> · {t('última tentativa {when}', { when: timeAgo(st.last) })}</>}
          </small>
        </span>
      </label>
    </div>
  );
}

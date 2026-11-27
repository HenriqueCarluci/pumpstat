// Cadeado dos recursos pagos: o recurso continua visível, com uma prévia borrada e o convite para o plano.
// Só aparece com a cobrança ligada (ou no modo "ver como" do admin).
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { entitlements, PLAN_LABEL, setPreviewPlan } from '../lib/plans.js';
import { canAdmin } from '../lib/admin.js';
import { isNative } from '../lib/native.js';
import { t } from '../lib/i18n.js';
import { Crown, Eye, FlaskConical, Lock } from './Icons.jsx';
import { clearCache, rpc } from '../lib/api.js';
import { useEffect, useState } from 'react';

const planName = (p) => PLAN_LABEL[p] || p;

/** Selo pequeno de cadeado + plano, para abas, menus e botões. */
export function LockBadge({ feature, className = '' }) {
  const { plan } = useData();
  const ent = entitlements(plan);
  if (ent.can(feature)) return null;
  return <span className={`lock-badge ${className}`} title={t('Disponível no {p}', { p: planName(ent.need(feature)) })}><Lock size={11} /> {planName(ent.need(feature))}</span>;
}

/** Texto do convite (no site a compra ainda é só pelo app Android). */
function Cta({ need }) {
  return (
    <div className="pl-cta">
      <Link to="/planos" className="btn"><Crown size={15} /> {t('Ver planos')}</Link>
      {!isNative && <p className="muted tiny">{t('A assinatura é feita pelo app Android (Google Play).')}</p>}
      <span className="sr-only">{planName(need)}</span>
    </div>
  );
}

/**
 * Envolve um recurso pago. Sem acesso: mostra `preview` (ou os filhos) borrado por baixo de um cartão com o convite.
 * `compact` = só o cartão, sem prévia (para áreas pequenas).
 */
export default function PlanLock({ feature, title, children, preview, compact = false }) {
  const { plan } = useData();
  const ent = entitlements(plan);
  if (ent.can(feature)) return children ?? null;
  const need = ent.need(feature);
  const card = (
    <div className="pl-card" role="note">
      <span className="pl-ico"><Lock size={18} /></span>
      <b>{title ? t('{f} está no {p}', { f: title, p: planName(need) }) : t('Disponível no {p}', { p: planName(need) })}</b>
      <p className="muted small">{need === 'pro' ? t('Seja Pro para liberar este recurso e tudo do Plus.') : t('Seja Plus para liberar este recurso, ficar sem anúncios e ver todas as análises.')}</p>
      <Cta need={need} />
    </div>
  );
  if (compact) return <section className="card pl-compact">{card}</section>;
  return (
    <div className="pl-wrap">
      <div className="pl-preview" aria-hidden="true" inert="">{preview ?? children}</div>
      {card}
    </div>
  );
}

const PLANS = [['free', 'Grátis'], ['plus', 'Plus'], ['pro', 'Pro']];
const DURATIONS = [[30, '30 min'], [60, '1 h'], [240, '4 h'], [1440, '24 h']];

function useLeft(until) {
  const [, tick] = useState(0);
  useEffect(() => { if (!until) return undefined; const id = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(id); }, [until]);
  if (!until) return '';
  const min = Math.max(0, Math.round((new Date(until) - new Date()) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}

/**
 * Modo de teste do admin: simula um plano por um tempo (no app e no servidor), sem mudar a assinatura nem o perfil
 * de administração. Expira sozinho.
 */
export function TestMode({ compact = false }) {
  const { plan } = useData();
  const ent = entitlements(plan);
  const [pick, setPick] = useState(ent.preview || 'free');
  const [mins, setMins] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = useLeft(ent.previewUntil);
  if (!plan?.admin) return null;
  const go = async (p, m) => {
    setBusy(true); setErr('');
    try { await setPreviewPlan(p, m); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className={`test-mode ${compact ? 'compact' : ''}`}>
      <div className="tm-head">
        <b className="ic-row"><FlaskConical size={15} /> {t('Modo de teste')}</b>
        {ent.preview
          ? <span className="tag plus">{t('Simulando {p} · faltam {t}', { p: t(planName(ent.preview)), t: left })}</span>
          : <span className="muted small">{t('Desligado: você vê tudo liberado')}</span>}
      </div>
      {!compact && <p className="muted small">{t('Veja o app como Grátis, Plus ou Pro, com cadeados e limites valendo também no servidor. Sua assinatura e seu perfil de administração não mudam, e o teste acaba sozinho.')}</p>}
      <div className="tm-row">
        <div className="chips">{PLANS.map(([id, l]) => <button key={id} type="button" className={pick === id ? 'on' : ''} onClick={() => setPick(id)}>{t(l)}</button>)}</div>
        <select value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label={t('Duração do teste')}>
          {DURATIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
        </select>
        <button type="button" className="btn" disabled={busy} onClick={() => go(pick, mins)}>{ent.preview ? t('Trocar') : t('Começar teste')}</button>
        {ent.preview && <button type="button" className="btn ghost" disabled={busy} onClick={() => go(null)}>{t('Sair do teste')}</button>}
      </div>
      {err && <div className="form-err">{err}</div>}
      {!compact && canAdmin(plan, 'view_as') && <TestAccounts />}
    </div>
  );
}

/** Contas de teste: abre o app como elas pelo "ver como" (só leitura), para conferir a navegação em situações específicas. */
function TestAccounts() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { rpc('admin_test_accounts').then(setList).catch(() => setList([])); }, []);
  if (!list?.length) return null;
  return (
    <div className="test-accounts">
      <b className="small">{t('Contas de teste')}</b>
      <p className="muted small">{t('Abra o app como uma conta de teste para ver a navegação nessa situação (só leitura, 30 minutos).')}</p>
      {list.map((a) => (
        <div key={a.id} className="ta-row">
          <span className="small">{t(a.label)}</span>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={async () => {
            setBusy(true); setErr('');
            try { await startViewAs(a.id, 30); } catch (e) { setErr(e.message); setBusy(false); }
          }}><Eye size={14} /> {t('Ver como')}</button>
        </div>
      ))}
      {err && <div className="form-err">{err}</div>}
    </div>
  );
}

/** Faixa no topo enquanto o admin está no modo de teste: troca rápida de plano e saída. */
export function PreviewBanner() {
  const { plan } = useData();
  const ent = entitlements(plan);
  const left = useLeft(ent.previewUntil);
  const [busy, setBusy] = useState(false);
  if (!ent.preview) return null;
  const go = async (p) => { setBusy(true); try { await setPreviewPlan(p, 60); } catch { setBusy(false); } };
  return (
    <div className="preview-banner" role="status">
      <span className="ic-row"><FlaskConical size={14} /> {t('Modo de teste: {p}', { p: ent.preview === 'free' ? t('Grátis') : planName(ent.preview) })} · {t('faltam {t}', { t: left })}</span>
      <span className="pb-actions">
        {PLANS.filter(([id]) => id !== ent.preview).map(([id, l]) => (
          <button key={id} type="button" className="link" disabled={busy} onClick={() => go(id)}>{t('Ver como {p}', { p: t(l) })}</button>
        ))}
        <button type="button" className="link" disabled={busy} onClick={() => go(null)}>{t('Sair do teste')}</button>
      </span>
    </div>
  );
}

/** Limpa o que o app guarda do usuário no aparelho (para não misturar os dados ao entrar/sair do "ver como"). */
export function clearUserCaches() {
  clearCache();
  try { Object.keys(localStorage).filter((k) => k.startsWith('pumpstat:missions:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignora */ }
}

/** Começa a ver o app como outra pessoa (só leitura). */
export async function startViewAs(userId, minutes = 30) {
  await rpc('admin_start_view_as', { p_user: userId, p_minutes: minutes });
  clearUserCaches();
  window.location.hash = '#/';
  window.location.reload();
}

/** Faixa vermelha enquanto o admin vê o app como outra pessoa (só leitura). */
export function ViewAsBanner() {
  const { plan } = useData();
  const v = plan?.view_as;
  const left = useLeft(v?.expires_at);
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const stop = async () => {
    setBusy(true);
    try { await rpc('admin_stop_view_as'); } catch { /* segue */ }
    clearUserCaches();
    window.location.hash = '#/admin?tab=users';
    window.location.reload();
  };
  return (
    <div className="viewas-banner" role="status">
      <span className="ic-row"><Eye size={15} /> {t('Vendo como {u} · só leitura · faltam {t}', { u: v.email || t('usuário'), t: left })}</span>
      <button type="button" className="link" disabled={busy} onClick={stop}>{t('Sair')}</button>
    </div>
  );
}

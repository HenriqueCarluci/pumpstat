// Cadeado dos recursos pagos: o recurso continua visível, com uma prévia borrada e o convite para o plano.
// Só aparece com a cobrança ligada (ou no modo "ver como" do admin).
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { entitlements, PLAN_LABEL, setPreviewPlan } from '../lib/plans.js';
import { isNative } from '../lib/native.js';
import { t } from '../lib/i18n.js';
import { Crown, Lock } from './Icons.jsx';

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
      <p className="muted small">{need === 'pro' ? t('Assine o Pro para liberar este recurso e todo o Plus.') : t('Assine o Plus para liberar este recurso, ficar sem anúncios e ver todas as análises.')}</p>
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

/** Faixa no topo quando o admin está vendo o app como outro plano. */
export function PreviewBanner() {
  const { plan } = useData();
  const ent = entitlements(plan);
  if (!ent.preview) return null;
  return (
    <div className="preview-banner">
      {t('Você está vendo o app como {p}.', { p: ent.preview === 'free' ? t('Grátis') : planName(ent.preview) })}
      <button type="button" className="link" onClick={() => { setPreviewPlan(null); window.location.reload(); }}>{t('Voltar ao normal')}</button>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { entitlements, PLAN_LABEL } from '../lib/plans.js';
import { manageUrl, restore, salesState, storeUrl } from '../lib/billing.js';
import { locale, t, tErr, tn } from '../lib/i18n.js';
import { Crown, RefreshCw } from '../components/Icons.jsx';

const SOURCE = { trial: 'Teste grátis', store: 'Assinatura pela Google Play', comp: 'Cortesia', lifetime: 'Vitalício' };

/** Minha assinatura: plano atual, validade, renovação e onde gerenciar. Aparece quando o admin liga os planos. */
export default function Subscription() {
  const { plan, reloadPlan } = useData();
  const ent = entitlements(plan);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ent.showPlans) return <div className="page"><p className="empty">{t('Os planos ainda não estão disponíveis.')}</p></div>;

  const cfg = ent.config;
  const sales = salesState(cfg);
  const paid = plan?.plan && plan.plan !== 'free';
  const exp = plan?.expires_at ? new Date(plan.expires_at) : null;
  const days = exp ? Math.max(0, Math.ceil((exp - Date.now()) / 86400000)) : null;
  const fmt = (d) => d.toLocaleDateString(locale(), { day: '2-digit', month: 'long', year: 'numeric' });
  const doRestore = async () => {
    setMsg(''); setBusy(true);
    try { await restore(); await reloadPlan(); setMsg(t('Compras restauradas.')); } catch (e) { setMsg(tErr(e.message)); } finally { setBusy(false); }
  };

  return (
    <div className="page subscription">
      {!cfg.show_plans && <div className="banner">{t('Prévia: só administradores veem esta tela enquanto os planos estão em desenvolvimento.')}</div>}
      <h2 className="ic-row"><Crown size={20} /> {t('Minha assinatura')}</h2>

      <section className={`card sub-status ${paid ? 'paid' : ''}`}>
        <div className="sub-plan">{paid ? `PIU Stats ${PLAN_LABEL[plan.plan]}` : t('Plano grátis')}</div>
        {paid && plan.source && <span className="tag">{t(SOURCE[plan.source] || plan.source)}</span>}
        <p className="small">
          {!paid && t('Você está no plano grátis. Fila, amigos, chat, Tier e sincronização continuam liberados.')}
          {paid && plan.source === 'trial' && exp && t('Seu teste acaba em {d} ({n}). Depois a conta volta para o plano grátis, sem cobrança.', { d: fmt(exp), n: tn(days, '{n} dia', '{n} dias') })}
          {paid && plan.source === 'store' && (plan.will_renew === false
            ? (exp ? t('Renovação cancelada: o plano vale até {d}.', { d: fmt(exp) }) : t('Renovação cancelada.'))
            : (exp ? t('Renova em {d}. Se cancelar, o plano vale até essa data.', { d: fmt(exp) }) : t('Assinatura ativa.')))}
          {paid && plan.source === 'comp' && (exp ? t('Cortesia até {d}.', { d: fmt(exp) }) : t('Cortesia sem prazo.'))}
          {paid && plan.source === 'lifetime' && t('Acesso vitalício.')}
        </p>
        <div className="bm-row">
          {(!paid || plan.source === 'trial') && <Link className="btn" to="/planos"><Crown size={15} /> {t('Ver planos e assinar')}</Link>}
          {paid && plan.source === 'store' && <Link className="btn ghost" to="/planos">{t('Trocar de plano')}</Link>}
          {paid && plan.source === 'store' && <a className="btn ghost" href={manageUrl(cfg, plan.plan)} target="_blank" rel="noreferrer">{t('Gerenciar ou cancelar na Google Play')}</a>}
          {sales === 'ready' && <button className="btn ghost" disabled={busy} onClick={doRestore}><RefreshCw size={15} /> {t('Restaurar compras')}</button>}
        </div>
        {msg && <p className="small">{msg}</p>}
        {sales === 'web' && <p className="muted small">{t('A assinatura é feita pelo app Android, na Google Play.')} <a href={storeUrl()} target="_blank" rel="noreferrer">{t('Baixar o app')}</a></p>}
      </section>

      <section className="card">
        <h3>{t('Dúvidas')}</h3>
        <dl className="faq small">
          <dt>{t('Como cancelo?')}</dt>
          <dd>{t('Na Google Play: Perfil → Pagamentos e assinaturas → Assinaturas → PIU Stats. O plano continua até o fim do período já pago.')}</dd>
          <dt>{t('Mensal ou anual?')}</dt>
          <dd>{t('O anual sai mais barato por mês e é cobrado uma vez por ano. Os dois renovam sozinhos até você cancelar.')}</dd>
          <dt>{t('Troquei de celular. Perdi a assinatura?')}</dt>
          <dd>{t('Não. A assinatura fica na sua conta do PIU Stats: entre com a mesma conta. No app, use "Restaurar compras" se precisar.')}</dd>
          <dt>{t('O que continua grátis?')}</dt>
          <dd>{t('Fila dos fliperamas, amigos, chat, Tier, votações, desafios, missões e a sincronização manual das suas notas.')}</dd>
        </dl>
      </section>
    </div>
  );
}

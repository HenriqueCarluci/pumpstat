import { useState } from 'react';
import { useData } from '../App.jsx';
import { locale, t } from '../lib/i18n.js';
import { entitlements, FEATURES, fmtPrice, LIMITS, PLAN_LABEL, PLAN_ORDER, priceRegion } from '../lib/plans.js';
import { Check, Crown, X } from '../components/Icons.jsx';
import { Chips } from './Songs.jsx';

const REGIONS = [['BR', 'Brasil'], ['US', 'EUA'], ['EU', 'Europa'], ['WORLD', 'Outros países']];

/** Vitrine dos planos. Só aparece para todos quando o admin liga "mostrar planos". */
export default function Plans() {
  const { plan } = useData();
  const ent = entitlements(plan);
  const cfgAds = !!ent.config?.ads?.enabled;
  const [region, setRegion] = useState(priceRegion);
  const [yearly, setYearly] = useState(false);
  if (!ent.showPlans) return <div className="page"><p className="empty">{t('Os planos ainda não estão disponíveis.')}</p></div>;
  const cfg = ent.config;
  const prices = cfg.prices?.[region] || cfg.prices?.WORLD || {};
  const need = (f) => cfg.features?.[f] || 'free';
  const lim = (p, k) => cfg.limits?.[p]?.[k];
  const price = (p) => (p === 'free' ? t('Grátis') : fmtPrice(prices[yearly ? `${p}_year` : p], prices.currency || 'USD', locale()));

  return (
    <div className="page plans">
      {!cfg.show_plans && <div className="banner">{t('Prévia: só administradores veem esta tela enquanto os planos estão em desenvolvimento.')}</div>}
      <h2 className="ic-row"><Crown size={20} /> {t('Planos do PIU Stats')}</h2>
      <p className="muted small">{t('Fila, amigos, chat e sincronização continuam grátis para todos. Os planos liberam análises e recursos extras.')}</p>
      {/* só o preço da região de quem vê; o admin pode conferir as outras */}
      {plan?.admin && (
        <div className="admin-preview small"><span className="muted">{t('Admin: ver o preço de outra região')}</span>
          <Chips value={region} onChange={setRegion} options={REGIONS.map(([k, l]) => [k, t(l)])} /></div>
      )}
      <Chips value={yearly ? 'y' : 'm'} onChange={(v) => setYearly(v === 'y')} options={[['m', t('Mensal')], ['y', t('Anual (−33%)')]]} />

      <div className="plan-cols">
        {PLAN_ORDER.map((p) => (
          <div key={p} className={`plan-col ${p} ${ent.plan === p ? 'current' : ''}`}>
            <div className="plan-name">{p === 'free' ? t('Grátis') : PLAN_LABEL[p]}</div>
            <div className="plan-price">{price(p)}{p !== 'free' && <small>/{yearly ? t('ano') : t('mês')}</small>}</div>
            {ent.plan === p ? <span className="tag">{t('Seu plano')}</span>
              : p !== 'free' && <button className="btn" disabled title={t('Em breve nas lojas')}>{t('Em breve')}</button>}
            <ul>
              {cfgAds && (
                <li className={p === 'free' ? 'off' : ''}>{p === 'free' ? <X size={14} /> : <Check size={14} />} {t('Sem anúncios')}</li>
              )}
              {LIMITS.map((l) => {
                const v = lim(p, l.id);
                return <li key={l.id}><Check size={14} /> {t(l.label)}: <b>{v == null || v === '' ? t('sem limite') : v}</b></li>;
              })}
              {FEATURES.map((f) => {
                const ok = PLAN_ORDER.indexOf(p) >= PLAN_ORDER.indexOf(need(f.id));
                return (
                  <li key={f.id} className={ok ? '' : 'off'}>
                    {ok ? <Check size={14} /> : <X size={14} />} {t(f.label)}{f.soon && <em className="soon"> · {t('em breve')}</em>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted tiny">{t('Quem assinar no começo mantém o preço enquanto não cancelar. Pagamento pelas lojas (Google Play e App Store).')}</p>
    </div>
  );
}

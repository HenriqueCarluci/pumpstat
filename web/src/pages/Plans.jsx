import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { purchase, salesState, storeUrl, waitForPlan, yearlySaving } from '../lib/billing.js';
import { locale, t, tErr } from '../lib/i18n.js';
import { entitlements, FEATURE_DEFAULTS, FEATURES, fmtPrice, LIMITS, PLAN_LABEL, PLAN_ORDER, priceRegion } from '../lib/plans.js';
import { Check, Crown, X } from '../components/Icons.jsx';
import { Chips } from './Songs.jsx';

const REGIONS = [['BR', 'Brasil'], ['US', 'EUA'], ['EU', 'Europa'], ['WORLD', 'Outros países']];

/** Vitrine dos planos. Só aparece para todos quando o admin liga "mostrar planos". */
export default function Plans() {
  const { plan, reloadPlan } = useData();
  const ent = entitlements(plan);
  const cfgAds = !!ent.config?.ads?.enabled;
  const [region, setRegion] = useState(priceRegion);
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  if (!ent.showPlans) return <div className="page"><p className="empty">{t('Os planos ainda não estão disponíveis.')}</p></div>;
  const cfg = ent.config;
  const prices = cfg.prices?.[region] || cfg.prices?.WORLD || {};
  const need = (f) => cfg.features?.[f] || FEATURE_DEFAULTS[f] || 'free';
  const lim = (p, k) => cfg.limits?.[p]?.[k];
  const sales = salesState(cfg);
  const save = Math.max(yearlySaving(prices, 'plus') || 0, yearlySaving(prices, 'pro') || 0);
  const buy = async (p) => {
    setErr(''); setBusy(p);
    try {
      const bought = await purchase(cfg, p, yearly ? 'year' : 'month', plan);
      if (bought) setErr((await waitForPlan(reloadPlan, p)) ? '' : t('Pagamento recebido. Seu plano aparece em instantes; se não aparecer, use "Restaurar compras" em Minha assinatura.'));
    } catch (e) { setErr(tErr(e.message)); } finally { setBusy(''); }
  };
  const action = (p) => {
    if (sales === 'ready') return <button className="btn" disabled={!!busy} onClick={() => buy(p)}>{busy === p ? t('Abrindo…') : t('Assinar')}</button>;
    if (sales === 'web') return <a className="btn ghost" href={storeUrl()} target="_blank" rel="noreferrer">{t('Assinar pelo app Android')}</a>;
    return <button className="btn" disabled title={t('Em breve nas lojas')}>{t('Em breve')}</button>;
  };
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
      <Chips value={yearly ? 'y' : 'm'} onChange={(v) => setYearly(v === 'y')} options={[['m', t('Mensal')], ['y', save ? t('Anual (economize {p}%)', { p: save }) : t('Anual')]]} />

      <div className="plan-cols">
        {PLAN_ORDER.map((p) => (
          <div key={p} className={`plan-col ${p} ${ent.plan === p ? 'current' : ''}`}>
            <div className="plan-name">{p === 'free' ? t('Grátis') : PLAN_LABEL[p]}</div>
            <div className="plan-price">{price(p)}{p !== 'free' && <small>/{yearly ? t('ano') : t('mês')}</small>}</div>
            {yearly && p !== 'free' && yearlySaving(prices, p) && <small className="plan-save">{t('{v} por mês', { v: fmtPrice(prices[`${p}_year`] / 12, prices.currency || 'USD', locale()) })} · −{yearlySaving(prices, p)}%</small>}
            {ent.plan === p ? <Link className="tag" to="/assinatura">{t('Seu plano')}</Link>
              : p !== 'free' && action(p)}
            <ul>
              {LIMITS.map((l) => {
                const v = lim(p, l.id);
                return <li key={l.id}><Check size={14} /> {t(l.label)}: <b>{v == null || v === '' ? t('sem limite') : v}</b></li>;
              })}
              {FEATURES.filter((f) => f.id !== 'no_ads' || cfgAds).map((f) => {
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
      {err && <div className="form-err">{err}</div>}
      <p className="muted tiny">{t('Renovação automática; cancele quando quiser pela Google Play e o plano vale até o fim do período pago. Quem assinar no começo mantém o preço enquanto não cancelar.')}</p>
      <p className="small center"><Link to="/assinatura">{t('Minha assinatura')}</Link></p>
    </div>
  );
}

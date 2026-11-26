// Venda de assinaturas.
// No app Android a cobrança é pela Google Play (obrigatório para assinatura digital na loja), através do
// RevenueCat: o app compra com o id da conta do PIU Stats e o RevenueCat avisa o servidor (webhook),
// que atualiza o plano no banco. O plano vale na conta, em qualquer aparelho e no site.
import { Capacitor } from '@capacitor/core';

export const ANDROID_PACKAGE = 'com.henriquecarluci.stepclub';

/** Produtos da Google Play: uma assinatura por plano, com dois planos básicos (mensal e anual). */
export const DEFAULT_PRODUCTS = { plus: 'piustats_plus', pro: 'piustats_pro', month: 'mensal', year: 'anual' };
export function products(cfg) { return { ...DEFAULT_PRODUCTS, ...(cfg?.sales?.products || {}) }; }

const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let rc = null;        // módulo do plugin (carregado só no app)
let configured = null; // id do usuário já configurado

/** Liga o RevenueCat para o usuário logado (só no app Android, com a venda ligada e a chave pública cadastrada). */
export async function initBilling(cfg, userId) {
  const key = cfg?.sales?.rc_key;
  if (!isAndroid() || !cfg?.sales?.enabled || !key || !userId) return false;
  if (configured === userId) return true;
  try {
    rc = rc || (await import('@revenuecat/purchases-capacitor')).Purchases;
    if (configured) await rc.logIn({ appUserID: userId });
    else await rc.configure({ apiKey: key, appUserID: userId });
    configured = userId;
    return true;
  } catch { return false; }
}

/**
 * Situação da venda para quem está vendo:
 * off: admin não ligou a venda · web: no site (assina pelo app Android) · pending: app sem cobrança configurada · ready: pode comprar.
 */
export function salesState(cfg) {
  if (!cfg?.sales?.enabled) return 'off';
  if (!Capacitor.isNativePlatform()) return 'web';
  return isAndroid() && cfg.sales.rc_key && configured ? 'ready' : 'pending';
}

/** Página de assinaturas da Google Play (cancelar, trocar forma de pagamento). */
export function manageUrl(cfg, plan) {
  const p = products(cfg);
  const sku = plan && p[plan] ? `&sku=${encodeURIComponent(p[plan])}` : '';
  return `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}${sku}`;
}

/** Link do app na Google Play (para quem está no site). */
export const storeUrl = () => `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * Compra (ou troca) de plano. Retorna false se a pessoa desistiu na tela da Google Play.
 * current: o plano atual vindo de my_plan (para trocar de Plus para Pro, ou de mensal para anual).
 */
export async function purchase(cfg, plan, period, current) {
  if (!rc || !configured) throw new Error('A assinatura pelo app ainda não está disponível.');
  const p = products(cfg);
  const id = `${p[plan]}:${p[period]}`;
  const { products: found } = await rc.getProducts({ productIdentifiers: [id] });
  const product = found?.find((x) => x.identifier === id) || found?.[0];
  if (!product) throw new Error('Plano não encontrado na Google Play. Tente de novo mais tarde.');
  const old = current?.source === 'store' && current.product && current.product !== id ? current.product.split(':')[0] : null;
  try {
    await rc.purchaseStoreProduct({ product, ...(old ? { googleProductChangeInfo: { oldProductIdentifier: old } } : {}) });
    return true;
  } catch (e) {
    if (e?.userCancelled || e?.code === '1' || /cancel/i.test(e?.message || '')) return false;
    throw e;
  }
}

export async function restore() {
  if (!rc || !configured) throw new Error('A assinatura pelo app ainda não está disponível.');
  await rc.restorePurchases();
}

/** Espera o servidor registrar a compra (o aviso do RevenueCat chega em alguns segundos). */
export async function waitForPlan(reloadPlan, plan, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const p = await reloadPlan();
    if (p?.plan === plan) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** Desconto do anual em relação a 12 meses do mensal (em %), ou null. */
export function yearlySaving(prices, plan) {
  const m = Number(prices?.[plan]), y = Number(prices?.[`${plan}_year`]);
  if (!m || !y) return null;
  const pct = Math.round((1 - y / (m * 12)) * 100);
  return pct > 0 ? pct : null;
}

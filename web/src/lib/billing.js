// Venda de assinaturas.
// No app Android a cobrança é pela Google Play (obrigatório para assinatura digital na loja).
// O plugin de cobrança entra quando o app estiver criado no Play Console; até lá o botão fica "Em breve".
import { Capacitor } from '@capacitor/core';

export const ANDROID_PACKAGE = 'com.henriquecarluci.stepclub';
export const PERIODS = ['month', 'year'];

/** Produtos da Google Play: uma assinatura por plano, com dois planos básicos (mensal e anual). */
export const DEFAULT_PRODUCTS = { plus: 'piustats_plus', pro: 'piustats_pro', month: 'mensal', year: 'anual' };

/**
 * Situação da venda para quem está vendo:
 * off: admin não ligou a venda · web: no site (assina pelo app Android) · pending: app sem cobrança ainda · ready: pode comprar.
 */
export function salesState(cfg) {
  if (!cfg?.sales?.enabled) return 'off';
  if (!Capacitor.isNativePlatform()) return 'web';
  return typeof window !== 'undefined' && window.PIUStatsBilling ? 'ready' : 'pending';
}

export function products(cfg) { return { ...DEFAULT_PRODUCTS, ...(cfg?.sales?.products || {}) }; }

/** Página de assinaturas da Google Play (cancelar, trocar forma de pagamento). */
export function manageUrl(cfg, plan) {
  const p = products(cfg);
  const sku = plan && p[plan] ? `&sku=${encodeURIComponent(p[plan])}` : '';
  return `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}${sku}`;
}

/** Link do app na Google Play (para quem está no site). */
export const storeUrl = () => `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/** Inicia a compra. Só funciona com o plugin de cobrança instalado (estado "ready"). */
export async function purchase(cfg, plan, period) {
  const b = window.PIUStatsBilling;
  if (!b) throw new Error('A assinatura pelo app ainda não está disponível.');
  const p = products(cfg);
  return b.purchase({ productId: p[plan], basePlanId: p[period] });
}

export async function restore() {
  const b = window.PIUStatsBilling;
  if (!b) throw new Error('A assinatura pelo app ainda não está disponível.');
  return b.restore();
}

/** Desconto do anual em relação a 12 meses do mensal (em %), ou null. */
export function yearlySaving(prices, plan) {
  const m = Number(prices?.[plan]), y = Number(prices?.[`${plan}_year`]);
  if (!m || !y) return null;
  const pct = Math.round((1 - y / (m * 12)) * 100);
  return pct > 0 ? pct : null;
}

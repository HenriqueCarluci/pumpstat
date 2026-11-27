// Anúncios do plano grátis. Configuração em app_config().ads, editada no painel do admin.
// provider 'house' = anúncios próprios (patrocinadores, o clube, o Plus); 'adsense' = Google AdSense (só na web).
// No app nativo o AdSense não é permitido pela política do Google; lá entram os anúncios próprios (ou AdMob, quando configurado).
import { rpc } from './api.js';
import { isNative } from './native.js';

import { entitlements, FEATURE_DEFAULTS, previewPlan, rank } from './plans.js';

export function adsConfig(plan) {
  const ads = plan?.config?.ads || {};
  const preview = previewPlan(plan);
  const mine = preview || plan?.plan || 'free';
  // "Sem anúncios" é um recurso da matriz de planos (padrão: a partir do Plus)
  const need = plan?.config?.features?.no_ads || FEATURE_DEFAULTS.no_ads;
  const show = !!ads.enabled && rank(mine) < rank(need) && (!plan?.admin || !!preview || !!ads.show_admin);
  return { ...ads, show, everyN: Math.max(4, Number(ads.every_n) || 12) };
}

export function activeHouse(ads) {
  const now = Date.now();
  return (ads.house || []).filter((a) => a && a.id && a.active !== false && (!a.until || Date.parse(a.until) > now) && (a.title || a.image));
}

/** Escolhe um anúncio próprio, variando pelo lugar e pela posição para não repetir o mesmo em sequência. */
export function pickHouse(ads, seed = 0) {
  const list = activeHouse(ads);
  if (!list.length) return null;
  const turn = Math.floor(Date.now() / 600000); // troca a cada 10 minutos
  return list[(seed + turn) % list.length];
}

export const isAdsense = (ads) => !isNative && ads.provider === 'adsense' && /^ca-pub-\d+$/.test(ads.adsense_client || '') && !!ads.adsense_slot;

let adsenseLoaded = null;
export function loadAdsense(client) {
  if (adsenseLoaded) return adsenseLoaded;
  adsenseLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return adsenseLoaded;
}

export const logAd = (id, kind, place) => rpc('log_ad_event', { p_ad: String(id).slice(0, 40), p_kind: kind, p_place: place || null }).catch(() => {});

/**
 * Anúncio da sincronização: no plano grátis ele SEMPRE aparece (mesmo com os anúncios gerais desligados),
 * a partir do momento em que a cobrança está ligada (ou no modo de teste do admin).
 */
export function syncAdOn(plan) {
  if (plan?.config?.ads?.sync_always === false) return adsConfig(plan).show;
  return !entitlements(plan).can('no_ads');
}

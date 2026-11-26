// Planos Grátis / Plus / Pro. A configuração (recursos, limites, preços) vem do banco e é editada pelo admin.
// Enquanto "enforce" estiver desligado (fase de desenvolvimento), todo mundo tem tudo liberado.
export const PLAN_ORDER = ['free', 'plus', 'pro'];
export const PLAN_LABEL = { free: 'Grátis', plus: 'Plus', pro: 'Pro' };

export const FEATURES = [
  { id: 'recommendations_all', label: 'Todas as recomendações para subir PUMBILITY' },
  { id: 'history_full', label: 'Histórico completo de notas' },
  { id: 'style_full', label: 'Estilo do chart completo (% por padrão)' },
  { id: 'evolution_chart', label: 'Gráfico de evolução', soon: true },
  { id: 'export', label: 'Exportar tier e cards em imagem', soon: true },
  { id: 'auto_sync', label: 'Sincronização automática' },
  { id: 'push', label: 'Notificação com o app fechado', soon: true },
  { id: 'training_plan', label: 'Plano de treino semanal e metas', soon: true },
  { id: 'weakness', label: 'Pontos fracos por padrão', soon: true },
];
export const LIMITS = [
  { id: 'friends', label: 'Amigos' },
  { id: 'recommendations', label: 'Recomendações visíveis' },
  { id: 'history_months', label: 'Meses de histórico' },
];

const rank = (p) => Math.max(0, PLAN_ORDER.indexOf(p || 'free'));

/** O que o usuário pode usar, a partir de my_plan(). */
export function entitlements(plan) {
  const cfg = plan?.config || {};
  const enforce = !!cfg.enforce;
  const mine = plan?.plan || 'free';
  const can = (feature) => {
    if (!enforce || plan?.admin) return true;
    const need = cfg.features?.[feature] || 'free';
    return rank(mine) >= rank(need);
  };
  // limite numérico do plano (null = sem limite)
  const limit = (key) => {
    if (!enforce || plan?.admin) return null;
    const v = cfg.limits?.[mine]?.[key];
    return v == null || v === '' ? null : Number(v);
  };
  return { plan: mine, enforce, showPlans: !!cfg.show_plans || !!plan?.admin, can, limit, config: cfg };
}

/** Região de preço pelo idioma/país do aparelho. */
export function priceRegion() {
  const langs = (navigator.languages || [navigator.language || '']).map((l) => l.toUpperCase());
  const region = (langs.find((l) => l.includes('-')) || '').split('-')[1] || '';
  if (region === 'BR' || langs[0]?.startsWith('PT-BR')) return 'BR';
  if (region === 'US') return 'US';
  const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
  if (EU.includes(region)) return 'EU';
  return 'WORLD';
}

export function fmtPrice(value, currency, locale) {
  if (value == null) return '—';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value); } catch { return `${currency} ${value}`; }
}

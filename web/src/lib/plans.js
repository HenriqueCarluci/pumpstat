// Planos Grátis / Plus / Pro. A configuração (recursos, limites, preços) vem do banco e é editada pelo admin.
// Enquanto "enforce" estiver desligado (fase de desenvolvimento), todo mundo tem tudo liberado.
export const PLAN_ORDER = ['free', 'plus', 'pro'];
export const PLAN_LABEL = { free: 'Grátis', plus: 'Plus', pro: 'Pro' };

export const FEATURES = [
  { id: 'recommendations_all', label: 'Todas as recomendações para subir PUMBILITY' },
  { id: 'history_full', label: 'Histórico completo de notas' },
  { id: 'style_full', label: 'Estilo do chart completo (% por padrão)' },
  { id: 'evolution_chart', label: 'Gráficos de evolução' },
  { id: 'tips', label: 'Dicas com base nos seus passes e quebras' },
  { id: 'export', label: 'Exportar tier e cards em imagem', soon: true },
  { id: 'auto_sync', label: 'Sincronização automática' },
  { id: 'push', label: 'Notificação com o app fechado', soon: true },
  { id: 'training_plan', label: 'Plano de treino semanal e metas' },
  { id: 'rival', label: 'Rival: comparação completa com um amigo' },
  { id: 'weakness', label: 'Pontos fracos por padrão' },
  { id: 'training_analysis', label: 'Meu treino: chance de passar e o que treinar' },
];
export const LIMITS = [
  { id: 'friends', label: 'Amigos' },
  { id: 'recommendations', label: 'Recomendações visíveis' },
  { id: 'history_months', label: 'Meses de histórico' },
];

// Liga/desliga geral (Administração → Recursos). Ausente = ligado.
export const TOGGLES = [
  { id: 'missions', label: 'Missões da semana', group: 'Gamificação' },
  { id: 'streak', label: 'Sequência de semanas', group: 'Gamificação' },
  { id: 'week_summary', label: 'Resumo da semana passada', group: 'Gamificação' },
  { id: 'challenges', label: 'Desafios do mês', group: 'Gamificação' },
  { id: 'rival', label: 'Rival', group: 'Social' },
  { id: 'friend_online', label: 'Aviso de amigo online', group: 'Social' },
  { id: 'online', label: 'Online agora e convites para jogar', group: 'Social' },
  { id: 'teams', label: 'Times', group: 'Social' },
  { id: 'tier_votes', label: 'Votação de tier', group: 'Comunidade' },
  { id: 'venue_requests', label: 'Cadastro e exclusão de fliperama pelos membros', group: 'Comunidade' },
  { id: 'training', label: 'Meu treino', group: 'Treino' },
];
export const isOn = (plan, id) => plan?.config?.toggles?.[id] !== false;

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

const BR_TZ = ['Sao_Paulo', 'Fortaleza', 'Recife', 'Bahia', 'Belem', 'Manaus', 'Cuiaba', 'Campo_Grande', 'Porto_Velho', 'Boa_Vista',
  'Rio_Branco', 'Araguaina', 'Maceio', 'Noronha', 'Santarem', 'Eirunepe'];
const NOT_EU_TZ = ['Moscow', 'Minsk', 'Istanbul', 'Kirov', 'Volgograd', 'Samara', 'Ulyanovsk', 'Saratov', 'Astrakhan', 'Kaliningrad', 'Simferopol',
  'London', 'Belfast', 'Guernsey', 'Isle_of_Man', 'Jersey', 'Zurich', 'Oslo', 'Belgrade', 'Sarajevo', 'Skopje', 'Podgorica', 'Tirane', 'Chisinau', 'Kiev', 'Kyiv'];

/** Região pelo fuso horário do aparelho (onde a pessoa está), ou null se não der para saber. */
function regionByTimeZone() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return null; }
  const [area, city = ''] = tz.split('/');
  if (area === 'America' && BR_TZ.includes(city)) return 'BR';
  if (area === 'America' && /^(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Adak|Nome|Sitka|Yakutat|Metlakatla|Menominee|Indiana|Kentucky|North_Dakota)/.test(tz.slice(8))) return 'US';
  if (tz === 'Pacific/Honolulu') return 'US';
  if (area === 'Europe') return NOT_EU_TZ.includes(city) ? 'WORLD' : 'EU';
  if (area === 'Atlantic' && ['Azores', 'Madeira', 'Canary'].includes(city)) return 'EU';
  return tz ? 'WORLD' : null;
}

/** Região de preço: onde a pessoa está (fuso do aparelho) e, sem isso, o país do idioma. */
export function priceRegion() {
  const byTz = regionByTimeZone();
  if (byTz) return byTz;
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

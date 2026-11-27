import { rpc } from './api.js';

// Planos Grátis / Plus / Pro. A configuração (recursos, limites, preços) vem do banco e é editada pelo admin.
// Enquanto "enforce" estiver desligado (fase de desenvolvimento), todo mundo tem tudo liberado.
export const PLAN_ORDER = ['free', 'plus', 'pro'];
export const PLAN_LABEL = { free: 'Grátis', plus: 'Plus', pro: 'Pro' };

export const FEATURES = [
  { id: 'no_ads', label: 'Sem anúncios (inclusive na sincronização)', group: 'Geral', min: 'plus' },
  { id: 'supporter', label: 'Selo "Apoiador" no perfil e acesso antecipado', group: 'Geral', min: 'pro' },
  { id: 'recommendations_all', label: 'Recomendações para subir PUMBILITY', group: 'Análises', min: 'plus' },
  { id: 'evolution_chart', label: 'Gráficos de evolução', group: 'Análises', min: 'plus' },
  { id: 'style_full', label: 'Todas as skills do chart (% de cada tag)', group: 'Análises', min: 'plus' },
  { id: 'tips', label: 'Dicas com base nos seus passes e quebras', group: 'Análises', min: 'plus' },
  { id: 'day_report', label: 'Dia de jogo (relatório do dia)', group: 'Análises', min: 'plus' },
  { id: 'weakness', label: 'Pontos fortes e fracos por padrão', group: 'Análises', min: 'pro' },
  { id: 'training_list', label: 'Meu treino: lista de charts para treinar', group: 'Treino', min: 'plus' },
  { id: 'training_analysis', label: 'Meu treino: chance de passar e o que treinar', group: 'Treino', min: 'plus' },
  { id: 'training_plan', label: 'Plano de treino semanal e metas', group: 'Treino', min: 'pro' },
  { id: 'missions_focus', label: 'Missões: foco da semana', group: 'Treino', min: 'pro' },
  { id: 'rival', label: 'Rival: comparação completa com um amigo', group: 'Social', min: 'plus' },
  { id: 'team_report', label: 'Relatório do time por dia, semana e mês', group: 'Social', min: 'plus' },
  { id: 'export', label: 'Exportar tier e cards em imagem', soon: true, group: 'Social', min: 'plus' },
  { id: 'auto_sync', label: 'Sincronização automática', group: 'Sincronização', min: 'pro' },
  { id: 'push', label: 'Notificação com o app fechado', soon: true, group: 'Sincronização', min: 'pro' },
  // removidos da matriz (agora livres para todos): histórico completo
  { id: 'history_full', label: 'Histórico completo de notas', group: 'Análises', min: 'free', hidden: true },
];
/** Plano mínimo de cada recurso quando o admin ainda não configurou. */
export const FEATURE_DEFAULTS = Object.fromEntries(FEATURES.map((f) => [f.id, f.min]));
/** Recursos sempre grátis (só para mostrar na matriz). */
export const ALWAYS_FREE = ['Recordes e histórico completo de passes e notas', 'Tier (Unique e New Tunes)', 'Lista de músicas e charts',
  'Sincronização manual (com anúncio no Grátis)', 'Fila dos fliperamas', 'Perfil com redes sociais e bandeira', 'Meu Time e cadastro de time',
  'Votações de tier e desafios do mês', 'Missões da semana, pontos e selos', 'Site no computador e busca'];
export const LIMITS = [
  { id: 'friends', label: 'Amigos' },
  { id: 'missions', label: 'Missões por semana' },
  { id: 'mission_rerolls', label: 'Trocas de missão por semana' },
];
/** Valores padrão dos limites (vazio = sem limite). */
export const LIMIT_DEFAULTS = {
  free: { friends: 5, missions: 2, mission_rerolls: 0 },
  plus: { friends: 10, missions: 4, mission_rerolls: 1 },
  pro: { missions: 5, mission_rerolls: 2 },
};

// Liga/desliga geral (Administração → Recursos). Ausente = ligado.
export const TOGGLES = [
  { id: 'missions', label: 'Missões da semana', group: 'Gamificação' },
  { id: 'streak', label: 'Sequência de semanas', group: 'Gamificação' },
  { id: 'week_summary', label: 'Resumo da semana passada', group: 'Gamificação' },
  { id: 'day_report', label: 'Relatório do dia de jogo', group: 'Gamificação' },
  { id: 'challenges', label: 'Desafios do mês', group: 'Gamificação' },
  { id: 'rival', label: 'Rival', group: 'Social' },
  { id: 'friend_online', label: 'Aviso de amigo online', group: 'Social' },
  { id: 'online', label: 'Online agora e convites para jogar', group: 'Social' },
  { id: 'teams', label: 'Times', group: 'Social' },
  { id: 'team_report', label: 'Relatório do time', group: 'Social' },
  { id: 'tier_votes', label: 'Votação de tier', group: 'Comunidade' },
  { id: 'venue_requests', label: 'Cadastro e exclusão de fliperama pelos membros', group: 'Comunidade' },
  { id: 'training', label: 'Meu treino', group: 'Treino' },
];
export const isOn = (plan, id) => plan?.config?.toggles?.[id] !== false;

export const rank = (p) => Math.max(0, PLAN_ORDER.indexOf(p || 'free'));

/** Modo de teste do admin: plano simulado (vem do servidor, com prazo). Não muda a assinatura de verdade. */
export function previewPlan(plan) {
  const p = plan?.preview;
  if (!plan?.admin || !p?.plan) return null;
  return !p.expires_at || new Date(p.expires_at) > new Date() ? p.plan : null;
}
/** Liga (plano + minutos) ou desliga (null) o modo de teste. O servidor também passa a aplicar os limites do plano. */
export async function setPreviewPlan(p, minutes = 60) {
  await rpc('admin_set_preview', { p_plan: p || null, p_minutes: minutes });
  try { localStorage.removeItem('pumpstat:preview-plan'); } catch { /* ignora */ }
  window.location.reload();
}

/** O que o usuário pode usar, a partir de my_plan(). */
export function entitlements(plan) {
  const cfg = plan?.config || {};
  const preview = previewPlan(plan);
  const enforce = !!cfg.enforce || !!preview;
  const mine = preview || plan?.plan || 'free';
  const bypass = !!plan?.admin && !preview;
  const need = (feature) => cfg.features?.[feature] || FEATURE_DEFAULTS[feature] || 'free';
  const can = (feature) => {
    if (!enforce || bypass) return true;
    return rank(mine) >= rank(need(feature));
  };
  // limite numérico do plano (null = sem limite)
  const limit = (key) => {
    if (!enforce || bypass) return null;
    const v = cfg.limits?.[mine]?.[key] ?? LIMIT_DEFAULTS[mine]?.[key];
    return v == null || v === '' ? null : Number(v);
  };
  return { plan: mine, enforce, preview, previewUntil: preview ? plan.preview.expires_at : null, showPlans: !!cfg.show_plans || !!plan?.admin, can, need, limit, config: cfg };
}

/** Preço de lançamento (os primeiros N meses) de uma região, se houver. */
export function introPrice(cfg, region, p) {
  const intro = cfg?.intro;
  if (!intro?.months) return null;
  const v = intro.prices?.[region]?.[p] ?? intro.prices?.WORLD?.[p];
  return v == null ? null : { value: v, months: intro.months };
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

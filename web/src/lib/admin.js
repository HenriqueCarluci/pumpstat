// Perfis da equipe de administração. As permissões valem no servidor (admin_perms); aqui só escondem o que a pessoa não pode usar.
export const ADMIN_ROLES = [
  ['owner', 'Dono', 'Tudo: planos, preços, cortesias, equipe e ver o app como um usuário.'],
  ['admin', 'Administrador geral', 'Tudo, menos planos e cobrança, gestão da equipe e ver como usuário.'],
  ['moderator', 'Moderação', 'Denúncias, bloquear e desbloquear contas, consultar usuários.'],
  ['curator', 'Curadoria de charts', 'Tier do clube, votações de tier, tags, gimmicks, R!SE e vídeos.'],
  ['events', 'Eventos e comunidade', 'Desafios, missões, fliperamas e times.'],
  ['support', 'Suporte', 'Mensagens do suporte e consulta de usuários.'],
];

/** O que cada permissão libera (espelha admin_perms no servidor). */
export const ADMIN_PERMS = [
  ['plans', 'Planos, preços, cortesias e liberação de recursos por usuário'],
  ['roles', 'Equipe: dar e tirar perfis'],
  ['view_as', 'Ver o app como um usuário (só leitura)'],
  ['stats', 'Números do app (usuários, ativos, assinantes)'],
  ['health', 'Monitoramento: desempenho, banco e erros'],
  ['users', 'Consultar usuários e alerta de conta nova'],
  ['ban', 'Bloquear e desbloquear contas'],
  ['reports', 'Denúncias'],
  ['feedback', 'Suporte'],
  ['charts', 'Curadoria de charts e tier'],
  ['events', 'Desafios e missões'],
  ['venues', 'Fliperamas e times'],
  ['ads', 'Anúncios'],
  ['config', 'Recursos, novidades e modo visitante'],
];
export const ROLE_PERMS = {
  owner: ADMIN_PERMS.map(([p]) => p),
  admin: ['stats', 'health', 'users', 'ban', 'reports', 'feedback', 'charts', 'events', 'venues', 'ads', 'config'],
  moderator: ['users', 'ban', 'reports'],
  curator: ['charts'],
  events: ['events', 'venues'],
  support: ['users', 'feedback'],
};
const LABEL = Object.fromEntries(ADMIN_ROLES.map(([id, l]) => [id, l]));
export const roleLabel = (r) => LABEL[r] || r || '';

/** A pessoa logada tem esta permissão de administração? */
export const canAdmin = (plan, perm) => (Array.isArray(plan?.perms) ? plan.perms.includes(perm) : !!plan?.admin);

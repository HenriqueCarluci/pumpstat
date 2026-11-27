// Perfis da equipe de administração. As permissões valem no servidor (admin_perms); aqui só escondem o que a pessoa não pode usar.
export const ADMIN_ROLES = [
  ['owner', 'Dono', 'Tudo, inclusive planos, cobrança e quem faz parte da equipe.'],
  ['admin', 'Administrador geral', 'Tudo, menos planos, cobrança e gestão da equipe.'],
  ['moderator', 'Moderação', 'Denúncias, bloquear e desbloquear contas, consultar usuários.'],
  ['curator', 'Curadoria de charts', 'Tier do clube, votações de tier, gimmicks, R!SE, vídeos e regras da votação.'],
  ['events', 'Eventos e comunidade', 'Desafios e prêmios, fliperamas e times.'],
  ['support', 'Suporte', 'Mensagens do suporte e consulta de usuários.'],
];
const LABEL = Object.fromEntries(ADMIN_ROLES.map(([id, l]) => [id, l]));
export const roleLabel = (r) => LABEL[r] || r || '';

/** A pessoa logada tem esta permissão de administração? */
export const canAdmin = (plan, perm) => (Array.isArray(plan?.perms) ? plan.perms.includes(perm) : !!plan?.admin);

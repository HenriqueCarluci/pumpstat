// Charts especiais: gimmick (por tipo) e steps fora da curva.
// Vem da marcação do admin e dos votos da comunidade (community_charts → c.special).
export const GIMMICKS = [
  ['speed', 'Mudança de velocidade'],
  ['stop', 'Paradas'],
  ['fake', 'Setas falsas'],
  ['warp', 'Warp (pulo no tempo)'],
  ['visual', 'Efeito visual (setas somem ou piscam)'],
  ['other', 'Outro'],
];
export const GIMMICK_LABEL = Object.fromEntries(GIMMICKS);
export const hasGimmick = (c) => !!c?.special?.gimmick;
export const isOffCurve = (c) => !!c?.special?.off;
/** Unique: marcado pela comunidade/admin (gimmick ou fora da curva) ou na faixa Unique do ArcadeStat. */
export const isUnique = (c) => c?.ref === 9;
export const isSpecial = (c) => hasGimmick(c) || isOffCurve(c) || isUnique(c);

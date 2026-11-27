// Tags dos charts no padrão do ArcadeStat (escolhidas por pessoas, chart a chart). O slug é o que fica no banco.
export const CHART_TAGS = [
  ['drill', 'Drill'], ['gimmick', 'Gimmick'], ['twist', 'Twist'], ['bracket', 'Bracket'], ['side', 'Lateral'],
  ['run', 'Corrida'], ['stamina', 'Resistência'], ['half', 'Meia pista'], ['crossover', 'Crossover'], ['mash', 'Mash'],
  ['high_twist', 'Twist alto'], ['horizontal_twist', 'Twist horizontal'], ['hold', 'Hold'], ['no_bar', 'Sem barra'],
  ['fast', 'Rápido'], ['slow', 'Lento'], ['cheat', 'Atalho (cheat)'], ['jack', 'Jack'], ['beat3', '3 beat'],
  ['stair', 'Escada'], ['switch', 'Troca de pé'], ['jump', 'Pulo'], ['leg_split', 'Abertura de pernas'],
  ['beat12', '12 beat'], ['beat24', '24 beat'], ['beat32', '32 beat'], ['double_stairs', 'Escada dupla'],
  ['gallop', 'Galope'], ['micro_desync', 'Micro-desync'], ['spin', 'Giro'],
];
export const CHART_TAG_LABEL = Object.fromEntries(CHART_TAGS);
export const chartTagLabel = (x) => CHART_TAG_LABEL[x] || x;

// cor de cada tag nos chips com % (segue as cores dos padrões do piucenter; o resto em tons neutros)
const TAG_COLOR = { twist: '#ff5d8f', high_twist: '#ff5d8f', horizontal_twist: '#ff5d8f', spin: '#ff5d8f', crossover: '#ff7fb0',
  drill: '#ffb02e', run: '#42c6ff', bracket: '#a77bff', jump: '#4be38a', jack: '#ff8a4c', switch: '#7de3d9',
  stamina: '#f25f5c', fast: '#ffd23f', slow: '#8fb3d9', gimmick: '#ffcf7a', half: '#9bd1ff', side: '#9bd1ff', hold: '#c7d0dd' };
export const tagColor = (x) => TAG_COLOR[x] || '#a9b4c4';

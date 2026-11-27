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

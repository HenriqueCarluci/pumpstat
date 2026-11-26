// Desafios do mês: textos dos tipos e dos prêmios (iguais para a página e para o admin).
import { t, tn } from './i18n.js';

// tipos que medem só o esforço de cada um, para qualquer nível participar
export const CHALLENGE_KINDS = [
  { id: 'days', label: 'Dias com jogo', hint: 'Dias diferentes em que a pessoa jogou no período.' },
  { id: 'plays', label: 'Jogadas', hint: 'Quantidade de músicas jogadas no período.' },
  { id: 'new_clears', label: 'Charts novos passados', hint: 'Charts que a pessoa nunca tinha passado, em qualquer nível.' },
  { id: 'improve', label: 'Recordes pessoais batidos', hint: 'Charts já passados em que a pessoa melhorou a própria nota.' },
  { id: 'song', label: 'Música do mês', hint: 'Passar a música escolhida em qualquer dificuldade (conta cada chart diferente).' },
  { id: 'grade', label: 'Nota mínima', hint: 'Jogadas com a nota escolhida ou melhor, no nível que a pessoa quiser.' },
];

export const PRIZE_MODES = [
  { id: 'raffle', label: 'Sorteio entre quem completar' },
  { id: 'all', label: 'Todo mundo que completar ganha' },
  { id: 'top', label: 'Os primeiros colocados' },
];

/** Meta do desafio em uma frase. */
export function goalText(c) {
  const n = c.goal;
  switch (c.kind) {
    case 'days': return tn(n, 'Jogue em {n} dia diferente', 'Jogue em {n} dias diferentes');
    case 'plays': return tn(n, 'Faça {n} jogada', 'Faça {n} jogadas');
    case 'new_clears': return tn(n, 'Passe {n} chart que você nunca tinha passado', 'Passe {n} charts que você nunca tinha passado');
    case 'improve': return tn(n, 'Bata seu recorde em {n} chart', 'Bata seu recorde em {n} charts');
    case 'song': return n > 1
      ? t('Passe {song} em {n} dificuldades diferentes', { song: c.song_title || '?', n })
      : t('Passe {song} em qualquer dificuldade', { song: c.song_title || '?' });
    case 'grade': return tn(n, 'Tire {g} ou melhor em {n} jogada, no nível que quiser', 'Tire {g} ou melhor em {n} jogadas, no nível que quiser', { g: c.min_grade });
    default: return '';
  }
}

export function prizeText(c) {
  if (c.prize_mode === 'all') return t('Todo mundo que completar ganha');
  if (c.prize_mode === 'top') return tn(c.winners, 'O 1º colocado ganha', 'Os {n} primeiros ganham');
  return tn(c.winners, 'Sorteio de {n} prêmio entre quem completar', 'Sorteio de {n} prêmios entre quem completar');
}

/** Modelos prontos para o admin (qualquer nível consegue participar). */
export const TEMPLATES = [
  { title: 'Maratona do mês', kind: 'days', goal: 8, prize_mode: 'raffle', winners: 1,
    description: 'Apareça no fliperama em 8 dias diferentes no mês. Vale qualquer música e qualquer nível.' },
  { title: 'Supere-se', kind: 'improve', goal: 10, prize_mode: 'raffle', winners: 1,
    description: 'Bata o seu próprio recorde em 10 charts. A disputa é com você mesmo.' },
  { title: 'Desbravador', kind: 'new_clears', goal: 10, prize_mode: 'raffle', winners: 1,
    description: 'Passe 10 charts que você nunca tinha passado, no nível que for melhor para você.' },
  { title: 'Música do mês', kind: 'song', goal: 1, prize_mode: 'all', winners: 1,
    description: 'Passe a música do mês em qualquer dificuldade. Todo mundo que passar ganha o brinde.' },
  { title: 'Caçador de S', kind: 'grade', goal: 15, min_grade: 'S', prize_mode: 'raffle', winners: 1,
    description: 'Tire S ou melhor em 15 jogadas. Escolha charts do seu nível de conforto.' },
];

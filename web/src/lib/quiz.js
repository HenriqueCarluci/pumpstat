// Questionário do jogador: experiência, frequência, objetivo, modo e o que quer melhorar.
// Pedido no primeiro acesso (pode pular) e refeito em Ajustes. Calibra missões e recomendações.
import { useEffect, useState } from 'react';
import { rpc } from './api.js';

export const QUESTIONS = [
  { id: 'exp', q: 'Há quanto tempo você joga Pump It Up?', opts: [['new', 'Estou começando'], ['lt1', 'Menos de 1 ano'], ['y1_3', 'De 1 a 3 anos'], ['gt3', 'Mais de 3 anos']] },
  { id: 'freq', q: 'Com que frequência você joga?', opts: [['rare', 'De vez em quando'], ['weekly', '1 vez por semana'], ['few', '2 ou 3 vezes por semana'], ['daily', 'Quase todo dia']] },
  { id: 'goal', q: 'O que você mais quer agora?', opts: [['fun', 'Me divertir'], ['level', 'Passar charts mais difíceis'], ['score', 'Melhorar minhas notas'], ['pumbility', 'Subir o PUMBILITY'], ['compete', 'Competir em campeonatos']] },
  { id: 'mode', q: 'Qual modo você mais joga?', opts: [['S', 'Single'], ['D', 'Double'], ['both', 'Os dois']] },
  { id: 'skills', q: 'Quer melhorar algo específico?', hint: 'Escolha até 3 (opcional).', multi: 3,
    opts: [['twist', 'Twist'], ['drill', 'Drill'], ['run', 'Corrida'], ['bracket', 'Bracket'], ['jump', 'Pulo'], ['stamina', 'Resistência'],
      ['switch', 'Troca de pé'], ['gimmick', 'Gimmick'], ['fast', 'Leitura de charts rápidos'], ['accuracy', 'Precisão (notas e timing)']] },
];
export const optLabel = (qid, v) => QUESTIONS.find((x) => x.id === qid)?.opts.find(([k]) => k === v)?.[1] || v;

let state = null; // { quiz, at, skipped_at }
let inflight = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f(state));

export function loadQuiz(force = false) {
  if (state && !force) return Promise.resolve(state);
  if (!inflight) {
    inflight = rpc('my_quiz').then((r) => { state = r || { quiz: null }; emit(); return state; })
      .catch(() => { state = state || { quiz: null, error: true }; return state; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}
export function useQuiz() {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.add(setS); loadQuiz().then(setS); return () => listeners.delete(setS); }, []);
  return s;
}
export async function saveQuiz(answers) {
  await rpc('save_quiz', { p: answers });
  state = { ...(state || {}), quiz: answers, at: new Date().toISOString() };
  emit();
}
export async function skipQuiz() {
  state = { ...(state || {}), skipped_at: new Date().toISOString() };
  emit();
  try { await rpc('skip_quiz'); } catch { /* fica só no aparelho */ }
}
/** O questionário do primeiro acesso está aberto (o convite do tutorial espera ele fechar). */
export function setQuizPromptOpen(on) { state = { ...(state || {}), promptOpen: on }; emit(); }

/** Ainda não respondeu nem pulou: o app pede no primeiro acesso. */
export const quizPending = (s) => !!s && !s.error && !s.quiz && !s.skipped_at;

// ---------- calibração ----------
/** Peso extra nas categorias de missão conforme o objetivo e o que quer melhorar. */
export function quizMul(quiz) {
  if (!quiz) return {};
  const m = {
    fun: { fun: 1.8, social: 1.5, habit: 1.2, level: 0.8 },
    level: { level: 1.6 },
    score: { score: 1.6 },
    pumbility: { score: 1.6, level: 1.1 },
    compete: { score: 1.3, level: 1.3 },
  }[quiz.goal] || {};
  if (quiz.skills?.length) m.weak = (m.weak || 1) * 1.4;
  return m;
}
/** Metas mais leves para quem está começando e um pouco mais puxadas para quem joga muito há anos. */
export function quizAdj(quiz) {
  if (!quiz) return 1;
  if (quiz.exp === 'new') return 0.85;
  if (quiz.exp === 'lt1') return 0.95;
  if (quiz.exp === 'gt3' && (quiz.freq === 'few' || quiz.freq === 'daily')) return 1.1;
  return 1;
}
/** Dias de jogo esperados quando ainda não há histórico. */
export const quizDays = (quiz) => ({ rare: 1, weekly: 1, few: 2, daily: 3 })[quiz?.freq] || null;
/** Aba inicial das Recomendadas. */
export const quizRecTab = (quiz) => (quiz?.goal === 'score' || quiz?.goal === 'pumbility' ? 'improve' : 'fresh');
/** Tags de chart que a pessoa quer treinar (as que existem como tag). */
export const quizTags = (quiz) => (quiz?.skills || []).filter((s) => s !== 'accuracy');

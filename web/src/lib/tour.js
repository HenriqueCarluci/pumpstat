// Tutorial guiado: passa pelas telas principais com um cartão explicando cada uma.
// No primeiro acesso o app pergunta se a pessoa quer fazer; dá para refazer em Ajustes.
import { useEffect, useState } from 'react';

const KEY = 'stepclub:tour';
let state = { step: -1, asked: false };
try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}'), step: -1 }; } catch { /* ignore */ }
const listeners = new Set();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ asked: state.asked })); } catch { /* ignore */ } };
const emit = () => listeners.forEach((fn) => fn({ ...state }));

export function useTour() {
  const [s, setS] = useState({ ...state });
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
  return s;
}
export const startTour = () => { state = { ...state, step: 0, asked: true }; save(); emit(); };
export const goTour = (step) => { state = { ...state, step }; emit(); };
export const endTour = () => { state = { ...state, step: -1, asked: true }; save(); emit(); };
export const markTourAsked = () => { state = { ...state, asked: true }; save(); emit(); };

/** Passos do tour (os de recursos desligados pelo admin são pulados). */
export const TOUR_STEPS = [
  { route: '/', icon: 'home', title: 'Início', text: 'Aqui fica o resumo: seus recordes, as missões da semana, os desafios e os atalhos. Os quadros recolhem para a tela não ficar comprida.' },
  { route: '/ajustes', icon: 'sync', title: 'Sincronizar suas notas', text: 'Conecte sua conta da Pump (AM.PASS) e sincronize depois de jogar. O site da Pump guarda só as 50 últimas jogadas, então sincronizar sempre deixa sua evolução completa.' },
  { route: '/musicas', icon: 'music', title: 'Músicas', text: 'Busque qualquer música e filtre por modo, nível, notas e especiais. Dentro da música você vê cada chart, avalia, abre o vídeo e vê o ranking dos amigos.' },
  { route: '/tier', icon: 'tier', title: 'Tier', text: 'Os charts de cada nível, do mais difícil ao mais fácil. Segure uma capa para colocar no Meu treino. Gimmick e charts fora da curva ficam em Especiais, e dá para ver só as músicas novas.' },
  { route: '/treino', icon: 'training', toggle: 'training', title: 'Meu treino', text: 'Sua lista de músicas para passar: a chance de cada uma, o que treinar antes e todas as suas tentativas, para ver a evolução.' },
  { route: '/progresso', icon: 'progress', title: 'Progresso', text: 'Evolução, músicas mais jogadas, pontos fortes e fracos por padrão, dicas e o plano de treino da semana.' },
  { route: '/jogadores', icon: 'friends', title: 'Amigos', text: 'Adicione amigos pelo nick da Pump, compare as notas, converse e chame para um x1.' },
  { route: '/time', icon: 'team', toggle: 'teams', title: 'Meu Time', text: 'Os participantes do seu time, o ranking por PUMBILITY e pelo maior nível passado, e a semana do time.' },
  { route: '/fila', icon: 'queue', title: 'Fila do fliperama', text: 'Entre na fila da máquina pelo celular, veja quem está jogando e seja avisado quando chegar a sua vez.' },
  { route: '/ajustes', icon: 'settings', title: 'Ajustes', text: 'Idioma, país, redes sociais, time e aparência. Para ver este tutorial de novo, é só tocar em "Ver tutorial" aqui.' },
];

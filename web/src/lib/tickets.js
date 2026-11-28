// Situação dos chamados do suporte, igual para quem abriu e para o admin.
import { t } from './i18n.js';

/** Situação do chamado em palavras simples + tom da etiqueta. */
export function ticketStatus(f) {
  const track = f.kind === 'bug' || f.kind === 'idea';
  switch (f.status) {
    case 'open': return [track ? t('Recebido · aguardando análise') : t('Recebido · aguardando resposta'), ''];
    case 'approved': return [f.kind === 'bug' ? t('Na fila de correção') : t('Aprovada · entra na próxima versão semanal'), 'info'];
    case 'need_info': return [t('Precisamos de mais detalhes'), 'warn'];
    case 'fixed': return [f.fixed_in ? t('Corrigido na versão {v}', { v: f.fixed_in }) : t('Corrigido'), 'ok'];
    case 'implemented': return [f.fixed_in ? t('Entregue na versão {v}', { v: f.fixed_in }) : t('Entregue'), 'ok'];
    case 'answered': return [t('Respondido'), 'ok'];
    case 'done': return [t('Resolvido'), 'ok'];
    case 'wontfix': return [t('Encerrado sem correção'), 'muted'];
    case 'rejected': return [t('Não entra no app por enquanto'), 'muted'];
    default: return [f.status, ''];
  }
}

/** Etiqueta pronta: <span className={`tag tk-st ${tone}`}>{label}</span> */

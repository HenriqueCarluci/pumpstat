// Notificações do PIU Stats: amizades, mensagens e convites, recordes dos amigos, músicas novas,
// pedidos de fliperama e de time, votações de tier e, para o admin, pedidos esperando aprovação.
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from './api.js';
import { fmtNum, t } from './i18n.js';
import { TIER_VOTES } from './piu.js';

const tierName = (v) => t((TIER_VOTES.find(([x]) => x === Number(v)) || [, '?'])[1]);

const POLL_MS = 2 * 60 * 1000;

export function describe(n) {
  const who = n.nickname || t('Um amigo');
  switch (n.kind) {
    case 'friend_score':
      return n.prev_score
        ? t('{who} subiu {song} {chart} para {grade} ({from} → {to})', { who, song: n.title, chart: `${n.mode}${n.level}`, grade: n.grade, from: fmt(n.prev_score), to: fmt(n.score) })
        : t('{who} fez {grade} em {song} {chart} ({to})', { who, song: n.title, chart: `${n.mode}${n.level}`, grade: n.grade, to: fmt(n.score) });
    case 'new_song':
      return t('Música nova no catálogo: {song}', { song: n.title }) + (n.charts?.length ? ` (${n.charts.join(' ')})` : '');
    case 'friend_request':
      return t('{who} quer ser seu amigo no PIU Stats', { who });
    case 'friend_accepted':
      return t('{who} aceitou sua solicitação. Agora vocês veem as notas um do outro', { who });
    case 'friend_new':
      return t('Você e {who} agora são amigos no PIU Stats', { who });
    case 'message':
      return (n.count > 1 ? t('{who} te mandou {n} mensagens', { who, n: n.count }) : t('{who} te mandou uma mensagem', { who })) + (n.message ? `: “${n.message}”` : '');
    case 'invite':
      return (n.venue_name ? t('{who} te chamou para jogar em {place}', { who, place: n.venue_name }) : t('{who} te chamou para jogar', { who })) + (n.message ? `: “${n.message}”` : '');
    case 'venue_approved':
      return t('Seu cadastro do fliperama {name} foi aprovado e já está na lista de filas', { name: n.name });
    case 'venue_rejected':
      return t('Seu cadastro do fliperama {name} não foi aprovado', { name: n.name }) + (n.note ? `: ${n.note}` : '');
    case 'team_approved':
      return t('O time {name} foi aprovado e você já faz parte dele', { name: n.name });
    case 'team_rejected':
      return t('O time {name} não foi aprovado', { name: n.name }) + (n.note ? `: ${n.note}` : '');
    case 'tier_vote_open':
      return t('{who} propôs mudar o tier de {song} {chart} para {tier}. Vote!', { who, song: n.title, chart: `${n.mode}${n.level}`, tier: tierName(n.to) });
    case 'tier_vote_result':
      return n.result === 'approved'
        ? t('Votação encerrada: {song} {chart} agora é {tier} no clube', { song: n.title, chart: `${n.mode}${n.level}`, tier: tierName(n.to) })
        : t('Votação encerrada: o tier de {song} {chart} continua o mesmo', { song: n.title, chart: `${n.mode}${n.level}` });
    case 'admin_venue_request':
      return t('{who} pediu o cadastro do fliperama {name} ({city})', { who, name: n.name, city: n.city });
    case 'venue_removed':
      return t('Seu pedido foi aprovado: o fliperama {name} saiu da lista', { name: n.name });
    case 'venue_removal_rejected':
      return t('Seu pedido para tirar o fliperama {name} da lista não foi aprovado', { name: n.name }) + (n.note ? `: ${n.note}` : '');
    case 'admin_venue_removal':
      return t('{who} pediu para tirar o fliperama {name} ({city}) da lista', { who, name: n.name, city: n.city }) + (n.reason ? `: “${n.reason}”` : '');
    case 'admin_team_request':
      return t('{who} pediu o cadastro do time {name}', { who, name: n.name });
    case 'challenge_new':
      return t('Desafio novo no clube: {name}. Participe!', { name: n.title });
    case 'challenge_won':
      return t('Você ganhou no desafio {name}!', { name: n.title }) + (n.prize ? ` ${t('Prêmio')}: ${n.prize}` : '');
    default:
      return t('Novidade no PIU Stats');
  }
}
const fmt = (v) => fmtNum(v);

export function linkFor(n) {
  switch (n.kind) {
    case 'friend_score': case 'new_song': case 'tier_vote_open': case 'tier_vote_result': return `/musica/${n.song}`;
    case 'friend_request': return '/jogadores?tab=requests';
    case 'invite': return n.venue ? `/fila/${n.venue}` : '/online';
    case 'venue_approved': return `/fila/${n.venue}`;
    case 'venue_rejected': case 'venue_removed': case 'venue_removal_rejected': return '/fila';
    case 'team_approved': case 'team_rejected': return '/ajustes';
    case 'challenge_new': case 'challenge_won': return '/desafios';
    case 'admin_venue_request': case 'admin_venue_removal': case 'admin_team_request': return '/admin?tab=approvals';
    default: return n.user ? `/jogador/${n.user}` : '/';
  }
}

export const canAlert = () => typeof window !== 'undefined' && 'Notification' in window;

/** Busca as notificações a cada 2 min e avisa no aparelho (se permitido) quando chega algo novo. */
export function useNotifications(enabled) {
  const [state, setState] = useState({ items: [], unread: 0, loaded: false });
  const seen = useRef(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await rpc('my_notifications');
      const fresh = r.items.filter((n) => n.unread);
      if (seen.current && canAlert() && Notification.permission === 'granted') {
        for (const n of fresh.filter((x) => !seen.current.has(key(x))).slice(0, 3)) {
          try { new Notification('PIU Stats', { body: describe(n), icon: n.jacket || '/icon.svg', tag: key(n) }); } catch { /* sem suporte */ }
        }
      }
      seen.current = new Set(r.items.map(key));
      setState({ ...r, loaded: true });
    } catch { /* offline: tenta de novo no próximo ciclo */ }
  }, [enabled]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);
  const markSeen = useCallback(async () => {
    setState((s) => ({ ...s, unread: 0 }));
    try { await rpc('mark_notifications_seen'); } catch { /* ignora */ }
  }, []);
  const dismiss = useCallback(async (key) => {
    setState((s) => ({ ...s, items: s.items.filter((n) => n.key !== key), unread: Math.max(0, s.unread - (s.items.find((n) => n.key === key)?.unread ? 1 : 0)) }));
    try { await rpc('dismiss_notification', { p_key: key }); } catch { load(); }
  }, [load]);
  const clearAll = useCallback(async () => {
    setState((s) => ({ ...s, items: [], unread: 0 }));
    try { await rpc('clear_notifications'); } catch { load(); }
  }, [load]);
  return { ...state, reload: load, markSeen, dismiss, clearAll };
}
const key = (n) => n.key || `${n.kind}:${n.at}:${n.chart || n.song || n.user}`;

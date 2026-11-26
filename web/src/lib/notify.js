// Notificações do StepClub: amigos que bateram recorde, músicas novas e pedidos de amizade.
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from './api.js';
import { fmtNum, t } from './i18n.js';

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
      return t('{who} quer ser seu amigo no StepClub', { who });
    case 'friend_accepted':
      return t('{who} aceitou sua solicitação. Agora vocês veem as notas um do outro', { who });
    default:
      return t('Novidade no StepClub');
  }
}
const fmt = (v) => fmtNum(v);

export const linkFor = (n) => (n.kind === 'friend_score' || n.kind === 'new_song' ? `/musica/${n.song}`
  : n.kind === 'friend_request' ? '/jogadores' : `/jogador/${n.user}`);

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
          try { new Notification('StepClub', { body: describe(n), icon: n.jacket || '/icon.svg', tag: key(n) }); } catch { /* sem suporte */ }
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
  return { ...state, reload: load, markSeen };
}
const key = (n) => `${n.kind}:${n.at}:${n.chart || n.song || n.user}`;

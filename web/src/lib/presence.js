// Presença: quem está com o app aberto aparece online. Batimento a cada 30 s com a aba visível.
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from './api.js';

const BEAT_MS = 30 * 1000;
const VENUE_TTL = 3 * 3600 * 1000;

/** Fliperama aberto por último (vale por 3 h): serve para mostrar quem está no mesmo lugar. */
export function currentVenue() {
  try {
    const at = +(localStorage.getItem('stepclub:venue-at') || 0);
    return Date.now() - at < VENUE_TTL ? localStorage.getItem('stepclub:venue') : null;
  } catch { return null; }
}
export function rememberVenue(slug) {
  try { localStorage.setItem('stepclub:venue', slug); localStorage.setItem('stepclub:venue-at', String(Date.now())); } catch { /* ignora */ }
}

export function usePresence(enabled) {
  const [state, setState] = useState({ online: 0, invites: [], replies: [], mode: 'all', status: 'online' });
  const busy = useRef(false);
  const beat = useCallback(async () => {
    if (!enabled || busy.current || document.hidden) return;
    busy.current = true;
    try { setState(await rpc('heartbeat', { p_venue: currentVenue() })); } catch { /* offline */ }
    busy.current = false;
  }, [enabled]);
  useEffect(() => {
    beat();
    const t = setInterval(beat, BEAT_MS);
    const vis = () => { if (!document.hidden) beat(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [beat]);
  return { ...state, refresh: beat };
}

export const QUICK_MESSAGES = ['Bora jogar?', 'Bora um x1?', 'Tô no fliperama, cola aqui!', 'Bora treinar uns charts juntos?'];

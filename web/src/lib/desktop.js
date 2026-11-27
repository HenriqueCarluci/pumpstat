// Modo desktop: navegador com tela larga (>= 1024px) ganha layout de site (barra lateral, busca no topo,
// páginas em colunas). Celular, tablet em pé e o app nativo continuam no layout de app.
// A classe `desk` no <html> liga o CSS do desktop; o hook serve para trocar estrutura (ex.: gaveta x painel).
import { useEffect, useState } from 'react';
import { isNative } from './native.js';

const QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;

export const isDesktopNow = () => !isNative && !!mq?.matches;

function apply() {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('desk', isDesktopNow());
}
apply();
mq?.addEventListener?.('change', apply);

export function useIsDesktop() {
  const [v, setV] = useState(isDesktopNow);
  useEffect(() => {
    if (!mq) return undefined;
    const fn = () => setV(isDesktopNow());
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);
  return v;
}

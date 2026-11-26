// Preferências de exibição guardadas no aparelho.
import { useEffect, useState } from 'react';

const KEY = 'stepclub:prefs';
const DEFAULTS = { tierGrade: 'md' }; // tamanho da nota sobre a capa no Tier: sm | md | lg

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

const listeners = new Set();
let current = read();

export function usePrefs() {
  const [prefs, setPrefs] = useState(current);
  useEffect(() => { listeners.add(setPrefs); return () => listeners.delete(setPrefs); }, []);
  const update = (patch) => {
    current = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
    listeners.forEach((fn) => fn(current));
  };
  return [prefs, update];
}

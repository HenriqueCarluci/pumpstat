// Preferências de exibição guardadas no aparelho.
import { useEffect, useState } from 'react';

const KEY = 'stepclub:prefs';
// tierGrade: tamanho da nota sobre a capa no Tier (sm | md | lg).
// legacyP1: na Phoenix 2, mostrar (separado e marcado) o recorde da Phoenix nos charts que você ainda não jogou na P2.
// friendOnline: aviso no canto quando um amigo fica online (estilo MSN).
// tierSize: tamanho das capas no Tier (sm = mais músicas por linha).
// tierMode / tierLast: último modo e último nível aberto no Tier, por modo ({ S: 18, D: 22 }).
const DEFAULTS = { tierGrade: 'md', tierSize: 'md', legacyP1: true, friendOnline: true };

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

// Cartão recolhível: título clicável com seta, lembra aberto/fechado no aparelho e,
// com maxHeight, rola por dentro para não esticar a página.
import { useState } from 'react';
import { ChevronDown } from './Icons.jsx';

const KEY = 'stepclub:panels';
const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

export function usePanelOpen(id, defaultOpen = true) {
  const [open, setOpen] = useState(() => { const v = readAll()[id]; return v == null ? defaultOpen : !!v; });
  const toggle = () => setOpen((o) => {
    const all = readAll(); all[id] = !o;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignora */ }
    return !o;
  });
  return [open, toggle];
}

export default function Panel({ id, title, extra, defaultOpen = true, maxHeight, className = '', children }) {
  const [open, toggle] = usePanelOpen(id, defaultOpen);
  return (
    <section className={`card panel ${open ? 'open' : 'closed'} ${className}`}>
      <div className="panel-h">
        <button className="panel-toggle" onClick={toggle} aria-expanded={open}>
          <ChevronDown size={18} className="panel-chev" />
          <h3>{title}</h3>
        </button>
        {extra && <div className="panel-extra">{extra}</div>}
      </div>
      {open && (
        <div className={`panel-body ${maxHeight ? 'scroll' : ''}`} style={maxHeight ? { maxHeight } : undefined}>
          {children}
        </div>
      )}
    </section>
  );
}

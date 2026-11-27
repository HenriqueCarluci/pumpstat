// Busca de jogadores pelo nick, enquanto digita (a mesma da tela de amigos). A ação de cada resultado vem de fora.
import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/api.js';
import { t } from '../lib/i18n.js';
import { Avatar } from '../pages/Players.jsx';

export function hl(name, term) {
  const i = (name || '').toLowerCase().indexOf(term.toLowerCase());
  if (i < 0 || !term) return name;
  return <>{name.slice(0, i)}<mark>{name.slice(i, i + term.length)}</mark>{name.slice(i + term.length)}</>;
}

export default function PlayerSearch({ action, placeholder, autoFocus = false, hint }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const run = async (term) => {
    const my = ++seq.current;
    if (term.length < 2) { setRes(null); setBusy(false); return; }
    setBusy(true);
    let r = [];
    try { r = await rpc('search_players', { p_query: term }); } catch { /* sem resultado */ }
    if (my === seq.current) { setRes(r || []); setBusy(false); }
  };
  useEffect(() => { const h = setTimeout(() => run(q.trim()), 250); return () => clearTimeout(h); }, [q]); // eslint-disable-line
  const refresh = () => run(q.trim());
  const clear = () => { setQ(''); setRes(null); };
  return (
    <div className="typeahead">
      <input autoFocus={autoFocus} placeholder={placeholder || t('Digite o nickname da Pump…')} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {busy && <span className="ta-spin muted small">{t('buscando…')}</span>}
      {res && (
        <div className="ta-list">
          {!res.length && <p className="muted small ta-empty">{t('Ninguém com “{q}”. A pessoa precisa ter conectado a conta da Pump no PIU Stats.', { q: q.trim() })}</p>}
          {res.map((p) => (
            <div key={p.id} className="player req">
              <Avatar p={p} />
              <span className="pinfo"><span className="ptitle">{p.title}</span><b>{hl(p.nickname, q.trim())}</b></span>
              <span className="req-actions">{action(p, { refresh, clear })}</span>
            </div>
          ))}
        </div>
      )}
      {hint && <p className="muted small">{hint}</p>}
    </div>
  );
}

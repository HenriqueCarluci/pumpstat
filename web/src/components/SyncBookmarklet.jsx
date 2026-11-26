import { useEffect, useRef, useState } from 'react';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/config.js';

export function bookmarkletCode(key, mode = 'sync') {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
  const cfg = JSON.stringify({ url: SUPABASE_URL, anon: SUPABASE_KEY, key, app: base + '/', mode });
  return `javascript:(()=>{window.__PUMPSTAT=${cfg};var s=document.createElement('script');s.src='${base}/collector.js?v='+Date.now();document.body.appendChild(s);})()`;
}

/** Botão arrastável para a barra de favoritos + "copiar código" (celular). */
export default function SyncBookmarklet({ syncKey, mode = 'sync', label = '▲ PIU Stats Sync', alt }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    // href "javascript:" é definido direto no DOM (o React bloqueia esse tipo de URL em JSX)
    if (ref.current && syncKey) ref.current.setAttribute('href', bookmarkletCode(syncKey, mode));
  }, [syncKey, mode]);

  if (!syncKey) return <p className="muted">Carregando a chave de sincronização…</p>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(bookmarkletCode(syncKey, mode)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('Copie o código abaixo:', bookmarkletCode(syncKey, mode)); }
  };
  return (
    <div className="bm-row">
      <a ref={ref} className={`bm ${alt ? 'alt' : ''}`} onClick={(e) => e.preventDefault()}>{label}</a>
      <button type="button" className="btn ghost" onClick={copy}>{copied ? 'Copiado!' : 'Copiar código'}</button>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useData } from '../App.jsx';
import { timeAgo } from '../components/ui.jsx';
import { signOut } from '../lib/auth.js';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/api.js';
import { VERSIONS } from '../lib/piu.js';

function bookmarklet(key, mode) {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
  const cfg = JSON.stringify({ url: SUPABASE_URL, anon: SUPABASE_KEY, key, app: base + '/', mode });
  return `javascript:(()=>{window.__PUMPSTAT=${cfg};var s=document.createElement('script');s.src='${base}/collector.js?v='+Date.now();document.body.appendChild(s);})()`;
}

export default function Settings() {
  const { data, version, reload, session, ingestKey: key } = useData();
  const [copied, setCopied] = useState('');
  const syncRef = useRef(null);
  const jackRef = useRef(null);

  useEffect(() => {
    // href "javascript:" é definido direto no DOM (o React bloqueia esse tipo de URL em JSX)
    if (syncRef.current) syncRef.current.setAttribute('href', bookmarklet(key, 'sync'));
    if (jackRef.current) jackRef.current.setAttribute('href', bookmarklet(key, 'jackets'));
  }, [key]);

  const copy = async (mode) => {
    try { await navigator.clipboard.writeText(bookmarklet(key, mode)); setCopied(mode); setTimeout(() => setCopied(''), 2000); }
    catch { window.prompt('Copie o código abaixo:', bookmarklet(key, mode)); }
  };

  return (
    <div className="page settings">
      <section className="card">
        <h3>Sincronizar scores</h3>
        <ol className="steps">
          <li>Arraste o botão <b>PumpStat Sync</b> para a barra de favoritos. No celular, copie o código, crie um favorito qualquer e substitua o endereço dele pelo código.</li>
          <li>Entre em <a href="https://piugame.com/my_page/my_best_score.php" target="_blank" rel="noreferrer">piugame.com</a> (Phoenix 2) ou <a href="https://phoenix.piugame.com/my_page/my_best_score.php" target="_blank" rel="noreferrer">phoenix.piugame.com</a> (Phoenix), já logado, e clique no favorito.</li>
        </ol>
        {key ? (
          <div className="bm-row">
            <a ref={syncRef} className="bm" onClick={(e) => e.preventDefault()}>▲ PumpStat Sync</a>
            <button className="btn ghost" onClick={() => copy('sync')}>{copied === 'sync' ? 'Copiado!' : 'Copiar código'}</button>
          </div>
        ) : <p className="muted">Carregando a chave de sincronização…</p>}
      </section>

      <section className="card">
        <h3>Capas das músicas</h3>
        <p className="muted">Busca as imagens oficiais no ranking "Over Lv.20" do site e grava no banco. Rode uma vez e repita quando sair música nova.</p>
        {key && (
          <div className="bm-row">
            <a ref={jackRef} className="bm alt" onClick={(e) => e.preventDefault()}>▲ PumpStat Capas</a>
            <button className="btn ghost" onClick={() => copy('jackets')}>{copied === 'jackets' ? 'Copiado!' : 'Copiar código'}</button>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Dados</h3>
        <p>{VERSIONS[version].name}: {data.songs.length} músicas · {data.charts.length} charts · última sincronização {timeAgo(data.lastSync)}</p>
        <div className="bm-row">
          <button className="btn" onClick={() => reload()}>Recarregar dados</button>
        </div>
        <p className="muted small">Para atualizar o catálogo de músicas e charts (músicas novas, dificuldades da comunidade), abra
          {' '}<a href="https://piuscores.arroweclip.se" target="_blank" rel="noreferrer">piuscores.arroweclip.se</a> e clique no favorito <b>PumpStat Sync</b>.</p>
      </section>

      <section className="card">
        <h3>Conta</h3>
        <p className="muted">Conectado como <b>{session.email}</b></p>
        <div className="bm-row"><button className="btn ghost" onClick={signOut}>Sair</button></div>
      </section>

      <section className="card muted small">
        <p>Catálogo de charts e dificuldades: <a href="https://piuscores.arroweclip.se" target="_blank" rel="noreferrer">PIU Scores</a>.
          Imagens de capa, grades, plates e bolinhas: © Andamiro, carregadas direto do piugame.com.
          Projeto pessoal, sem vínculo com a Andamiro.</p>
      </section>
    </div>
  );
}

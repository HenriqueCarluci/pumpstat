import { useData } from '../App.jsx';
import PiuConnect from '../components/PiuConnect.jsx';
import SyncBookmarklet from '../components/SyncBookmarklet.jsx';
import { timeAgo } from '../components/ui.jsx';
import { signOut } from '../lib/auth.js';
import { VERSIONS } from '../lib/piu.js';

export default function Settings() {
  const { data, version, reload, session, ingestKey } = useData();

  return (
    <div className="page settings">
      <section className="card">
        <h3>Sincronizar com a Pump It Up</h3>
        <PiuConnect compact onDone={() => reload()} />
      </section>

      <section className="card">
        <h3>Capas das músicas</h3>
        <p className="muted small">No piugame.com, logado, clique neste favorito para buscar as capas oficiais (ranking "Over Lv.20").
          Para músicas novas e o catálogo de charts, clique no <b>StepClub Sync</b> em{' '}
          <a href="https://piuscores.arroweclip.se" target="_blank" rel="noreferrer">piuscores.arroweclip.se</a>.</p>
        <SyncBookmarklet syncKey={ingestKey} mode="jackets" label="▲ StepClub Capas" alt />
      </section>

      <section className="card">
        <h3>Dados</h3>
        <p>{VERSIONS[version].name}: {data.songs.length} músicas · {data.charts.length} charts · última sincronização {timeAgo(data.lastSync)}</p>
        <div className="bm-row"><button className="btn" onClick={() => reload()}>Recarregar dados</button></div>
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

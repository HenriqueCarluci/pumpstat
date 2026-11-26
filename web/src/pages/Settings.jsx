import { useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { usePrefs } from '../lib/prefs.js';
import { Chips } from './Songs.jsx';
import PiuConnect, { QuickSync } from '../components/PiuConnect.jsx';
import { timeAgo } from '../components/ui.jsx';
import { signOut } from '../lib/auth.js';
import { VERSIONS } from '../lib/piu.js';

export default function Settings() {
  const { data, version, reload, session } = useData();
  const [isPublic, setIsPublic] = useState(null);
  const [prefs, setPrefs] = usePrefs();
  useEffect(() => { rpc('players', { p_version: version }).then((ps) => setIsPublic(ps.find((p) => p.me)?.public ?? true)).catch(() => {}); }, [version]);
  const togglePublic = async () => { const v = !isPublic; setIsPublic(v); try { await rpc('set_public', { p_public: v }); } catch { setIsPublic(!v); } };

  return (
    <div className="page settings">
      <section className="card">
        <h3>Sincronizar com a Pump It Up</h3>
        <p className="muted small">Última sincronização da {VERSIONS[version].name}: {timeAgo(data.lastSync)}</p>
        <QuickSync onDone={() => reload()} />
        <details className="other-login">
          <summary className="small">Entrar com outra conta AM.PASS</summary>
          <PiuConnect compact onDone={() => reload()} />
        </details>
      </section>

      <section className="card">
        <h3>Exibição</h3>
        <p className="muted small">Tamanho da nota sobre a capa da música na tela de Tier</p>
        <Chips value={prefs.tierGrade} onChange={(v) => setPrefs({ tierGrade: v })}
          options={[['sm', 'Pequena'], ['md', 'Média'], ['lg', 'Grande']]} />
      </section>

      <section className="card">
        <h3>Conta StepClub</h3>
        <p className="muted">Conectado como <b>{session.email}</b></p>
        {isPublic != null && (
          <label className="switch-row">
            <input type="checkbox" checked={isPublic} onChange={togglePublic} />
            <span>Mostrar meu perfil e minhas notas para os outros jogadores do StepClub (ranking e comparação)</span>
          </label>
        )}
        <div className="bm-row">
          <button className="btn ghost" onClick={() => reload()}>Recarregar dados</button>
          <button className="btn ghost" onClick={signOut}>Sair</button>
        </div>
      </section>

      <section className="card muted small">
        <p>Catálogo de charts e dificuldades: <a href="https://piuscores.arroweclip.se" target="_blank" rel="noreferrer">PIU Scores</a>.
          Imagens de capa, grades, plates e bolinhas: © Andamiro, carregadas direto do piugame.com.
          Projeto independente, sem vínculo com a Andamiro.</p>
      </section>
    </div>
  );
}

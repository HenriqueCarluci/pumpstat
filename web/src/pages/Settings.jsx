import { useData } from '../App.jsx';
import { usePrefs } from '../lib/prefs.js';
import { Chips } from './Songs.jsx';
import PiuConnect, { QuickSync } from '../components/PiuConnect.jsx';
import { timeAgo } from '../components/ui.jsx';
import { signOut } from '../lib/auth.js';
import { VERSIONS } from '../lib/piu.js';
import { t } from '../lib/i18n.js';
import LangPicker from '../components/LangPicker.jsx';
import Feedback from '../components/Feedback.jsx';

export default function Settings() {
  const { data, version, reload, session } = useData();
  const [prefs, setPrefs] = usePrefs();

  return (
    <div className="page settings">
      <section className="card">
        <h3>{t('Sincronizar com a Pump It Up')}</h3>
        <p className="muted small">{t('Última sincronização da {v}: {when}', { v: VERSIONS[version].name, when: timeAgo(data.lastSync) })}</p>
        <QuickSync onDone={() => reload()} />
        <details className="other-login">
          <summary className="small">{t('Entrar com outra conta AM.PASS')}</summary>
          <PiuConnect compact onDone={() => reload()} />
        </details>
      </section>

      <section className="card">
        <h3>{t('Idioma')}</h3>
        <LangPicker compact />
      </section>

      <section className="card">
        <h3>{t('Exibição')}</h3>
        <p className="muted small">{t('Tamanho da nota sobre a capa da música na tela de Tier')}</p>
        <Chips value={prefs.tierGrade} onChange={(v) => setPrefs({ tierGrade: v })}
          options={[['sm', t('Pequena')], ['md', t('Média')], ['lg', t('Grande')]]} />
      </section>

      <section className="card">
        <h3>{t('Ajuda e feedback')}</h3>
        <p className="muted small">{t('Encontrou um problema, tem uma dúvida ou uma ideia? Mande para o suporte.')}</p>
        <Feedback />
      </section>

      <section className="card">
        <h3>{t('Conta StepClub')}</h3>
        <p className="muted">{t('Conectado como')} <b>{session.email}</b></p>
        <div className="bm-row">
          <button className="btn ghost" onClick={() => reload()}>{t('Recarregar dados')}</button>
          <button className="btn ghost" onClick={signOut}>{t('Sair')}</button>
        </div>
      </section>

      <section className="card muted small">
        <p>{t('Catálogo de charts e dificuldades:')} <a href="https://piuscores.arroweclip.se" target="_blank" rel="noreferrer">PIU Scores</a>.{' '}
          {t('Estilo dos charts: anotações do')} <a href="https://www.piucenter.com" target="_blank" rel="noreferrer">piucenter</a>.{' '}
          {t('Imagens de capa, grades, plates e bolinhas: © Andamiro, carregadas direto do piugame.com.')}{' '}
          {t('Projeto independente, sem vínculo com a Andamiro.')}</p>
      </section>
    </div>
  );
}

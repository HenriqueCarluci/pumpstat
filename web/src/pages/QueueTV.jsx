import { useParams } from 'react-router-dom';
import { Person, useVenue } from './Queue.jsx';
import { locale, t } from '../lib/i18n.js';
import { Logo } from '../components/Icons.jsx';

/** Tela para deixar na TV do clube: quem está jogando e os próximos, em letras grandes. */
export default function QueueTV() {
  const { slug } = useParams();
  const { venue, entries } = useVenue(slug);
  if (!venue) return <div className="tv"><p>{t('Carregando…')}</p></div>;
  const url = `${window.location.origin}${window.location.pathname}#/fila/${slug}`;
  return (
    <div className="tv">
      <header>
        <div className="brand"><Logo size={34} /> {venue.venue.name}</div>
        <div className="tv-clock">{new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</div>
      </header>
      <div className="tv-grid">
        {venue.machines.map((m) => {
          const list = entries.filter((e) => e.machine_id === m.id);
          const waiting = list.filter((e) => e.status === 'waiting');
          return (
            <section key={m.id} className="tv-machine">
              <h2>{m.name}</h2>
              {waiting[0] ? <div className="tv-now"><span>{t('Jogando agora').toUpperCase()}</span><Person entry={waiting[0]} big /></div>
                : <div className="tv-now empty">{t('Máquina livre!')}</div>}
              <ol>
                {list.filter((e) => e !== waiting[0]).slice(0, 8).map((e) => (
                  <li key={e.id} className={e.status === 'away' ? 'away' : ''}><Person entry={e} />{e.status === 'away' && <em>{t('ausente')}</em>}</li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      <footer>{t('Entre na fila pelo celular:')} <b>{url.replace(/^https?:\/\//, '')}</b></footer>
    </div>
  );
}

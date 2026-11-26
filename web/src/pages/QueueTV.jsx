import { useParams } from 'react-router-dom';
import { Person, useVenue } from './Queue.jsx';

/** Tela para deixar na TV do clube: quem está jogando e os próximos, em letras grandes. */
export default function QueueTV() {
  const { slug = 'liberdade' } = useParams();
  const { venue, entries } = useVenue(slug);
  if (!venue) return <div className="tv"><p>Carregando…</p></div>;
  const url = `${window.location.origin}${window.location.pathname}#/fila/${slug}`;
  return (
    <div className="tv">
      <header>
        <div className="brand"><span className="logo">▲</span> {venue.venue.name}</div>
        <div className="tv-clock">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      </header>
      <div className="tv-grid">
        {venue.machines.map((m) => {
          const list = entries.filter((e) => e.machine_id === m.id);
          const waiting = list.filter((e) => e.status === 'waiting');
          return (
            <section key={m.id} className="tv-machine">
              <h2>{m.name}</h2>
              {waiting[0] ? <div className="tv-now"><span>JOGANDO AGORA</span><Person entry={waiting[0]} big /></div>
                : <div className="tv-now empty">Máquina livre!</div>}
              <ol>
                {list.filter((e) => e !== waiting[0]).slice(0, 8).map((e) => (
                  <li key={e.id} className={e.status === 'away' ? 'away' : ''}><Person entry={e} />{e.status === 'away' && <em>ausente</em>}</li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      <footer>Entre na fila pelo celular: <b>{url.replace(/^https?:\/\//, '')}</b></footer>
    </div>
  );
}

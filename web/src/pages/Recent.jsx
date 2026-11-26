import { useData } from '../App.jsx';
import { ScoreCard } from '../components/ui.jsx';

export default function Recent() {
  const { data } = useData();
  if (!data.plays.length) {
    return <div className="page"><p className="empty">Nenhuma jogada registrada ainda. Sincronize em Ajustes.</p></div>;
  }
  const byDay = new Map();
  for (const p of data.plays) {
    const day = new Date(p.playedAt).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(p);
  }
  return (
    <div className="page">
      {[...byDay.entries()].map(([day, plays]) => (
        <section key={day}>
          <h3 className="group-h">{day} <span className="muted">· {plays.length} jogadas</span></h3>
          <div className="cards">
            {plays.map((p, i) => (
              <ScoreCard key={i} chart={p.chart} score={p.score} grade={p.grade} plate={p.plate} broken={p.broken}
                date={p.playedAt} to={`/musica/${p.chart.song.id}`}
                extra={p.perfect != null && (
                  <div className="judg-row">
                    <span className="j1">{p.perfect}</span><span className="j2">{p.great}</span>
                    <span className="j3">{p.good}</span><span className="j4">{p.bad}</span><span className="j5">{p.miss}</span>
                  </div>
                )} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

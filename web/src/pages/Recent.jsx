import { useData } from '../App.jsx';
import { ScoreCard } from '../components/ui.jsx';
import { locale, t, tn } from '../lib/i18n.js';

export default function Recent() {
  const { data } = useData();
  if (!data.plays.length) {
    return <div className="page"><p className="empty">{t('Nenhuma jogada registrada ainda. Sincronize em Ajustes.')}</p></div>;
  }
  const byDay = new Map();
  for (const p of data.plays) {
    const day = new Date(p.playedAt).toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: 'long' });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(p);
  }
  return (
    <div className="page">
      {[...byDay.entries()].map(([day, plays]) => (
        <section key={day}>
          <h3 className="group-h">{day} <span className="muted">· {tn(plays.length, '{n} jogada', '{n} jogadas')}</span></h3>
          <div className="cards">
            {plays.map((p, i) => (
              <ScoreCard key={i} chart={p.chart} score={p.score} grade={p.grade} plate={p.plate} broken={p.broken}
                date={p.playedAt} to={`/musica/${p.chart.song.id}`}
                extra={p.perfect != null && (
                  <div className="judg-row">
                    {[['j1', 'PERFECT', p.perfect], ['j2', 'GREAT', p.great], ['j3', 'GOOD', p.good], ['j4', 'BAD', p.bad], ['j5', 'MISS', p.miss]].map(([cls, label, n]) => (
                      <span key={cls} className={cls}><small>{label}</small>{n}</span>
                    ))}
                  </div>
                )} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

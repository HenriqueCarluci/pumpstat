import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { ScoreCard, timeAgo } from '../components/ui.jsx';
import { locale, t, tMsg, tn } from '../lib/i18n.js';
import { useSyncJob } from '../components/PiuConnect.jsx';
import { RefreshCw } from '../components/Icons.jsx';

/** Atualização rápida: busca só as jogadas recentes da versão aberta (sem reler todos os recordes). */
function RefreshRecent() {
  const { version, reload, data } = useData();
  const { job, err, needLogin, start, running } = useSyncJob(() => reload());
  const res = job?.state === 'done' ? job.results?.[version] : null;
  return (
    <div className="recent-refresh">
      <div className="row-between">
        <small className="muted">{t('Última sincronização: {when}', { when: timeAgo(data.lastSync) })}</small>
        <button className="btn ghost" disabled={running} onClick={() => start({ useSaved: true, partial: true, versions: [version] })}>
          <RefreshCw size={15} className={running ? 'spin' : ''} /> {running ? t('Atualizando…') : t('Atualizar')}
        </button>
      </div>
      {running && <small className="muted">{tMsg(job?.message)}</small>}
      {res && <small className="muted">{res.new_plays ? tn(res.new_plays, '{n} jogada nova', '{n} jogadas novas') : t('Nenhuma jogada nova.')}{res.new_bests ? ` · ${tn(res.new_bests, '{n} recorde novo', '{n} recordes novos')}` : ''}</small>}
      {err && <div className="form-err">{err}</div>}
      {needLogin && <p className="small">{t('Para atualizar, conecte sua conta da Pump uma vez em')} <Link to="/ajustes">{t('Ajustes')}</Link>.</p>}
    </div>
  );
}

export default function Recent() {
  const { data } = useData();
  if (!data.plays.length) {
    return <div className="page"><RefreshRecent /><p className="empty">{t('Nenhuma jogada registrada ainda. Sincronize em Ajustes.')}</p></div>;
  }
  const byDay = new Map();
  for (const p of data.plays) {
    const day = new Date(p.playedAt).toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: 'long' });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(p);
  }
  return (
    <div className="page">
      <RefreshRecent />
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

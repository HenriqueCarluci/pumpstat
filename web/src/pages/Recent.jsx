import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { ScoreCard, timeAgo } from '../components/ui.jsx';
import { t, tMsg, tn } from '../lib/i18n.js';
import { isOn } from '../lib/plans.js';
import { dayLabelOf } from '../lib/dayImage.js';
import { useSyncJob } from '../components/PiuConnect.jsx';
import { CalendarCheck, RefreshCw } from '../components/Icons.jsx';

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
      {res && res.new_plays > 0 && <Link className="link small ic-row" to="/dia"><CalendarCheck size={14} /> {t('Ver meu dia de jogo')}</Link>}
      {err && <div className="form-err">{err}</div>}
      {needLogin && <p className="small">{t('Para atualizar, conecte sua conta da Pump uma vez em')} <Link to="/ajustes">{t('Ajustes')}</Link>.</p>}
    </div>
  );
}

/** Dia de jogo (5h às 5h no horário de São Paulo), igual ao do banco. */
function playDay(at) {
  const d = new Date(new Date(at).getTime() - 5 * 3600_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export default function Recent() {
  const { data, plan } = useData();
  if (!data.plays.length) {
    return <div className="page"><RefreshRecent /><p className="empty">{t('Nenhuma jogada registrada ainda. Sincronize em Ajustes.')}</p></div>;
  }
  const byDay = new Map();
  for (const p of data.plays) {
    const key = playDay(p.playedAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }
  const showReport = isOn(plan, 'day_report');
  return (
    <div className="page">
      <RefreshRecent />
      {[...byDay.entries()].map(([day, plays]) => (
        <section key={day}>
          <h3 className="group-h row-between">
            <span>{dayLabelOf(day, { weekday: 'long', day: '2-digit', month: 'long' })} <span className="muted">· {tn(plays.length, '{n} jogada', '{n} jogadas')}</span></span>
            {showReport && <Link className="link small ic-row" to={`/dia/${day}`}><CalendarCheck size={14} /> {t('Relatório do dia')}</Link>}
          </h3>
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

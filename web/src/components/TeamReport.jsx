import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { fmtNum, locale, t, tErr } from '../lib/i18n.js';
import { Ball } from './ui.jsx';
import { SERIES, StackedBars } from './MiniChart.jsx';
import { Chips } from '../pages/Songs.jsx';
import { Avatar } from '../pages/Players.jsx';
import { BarChart3, ChevronLeft, ChevronRight } from './Icons.jsx';

const PERIODS = [['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']];

/** Variação em relação ao período anterior (↑ verde, ↓ vermelho). */
function Delta({ now, before }) {
  if (before == null) return null;
  if (!before) return now ? <span className="delta up">{t('novo')}</span> : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return <span className="delta">=</span>;
  return <span className={`delta ${pct > 0 ? 'up' : 'down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

/** Relatório do time por dia, semana ou mês: totais com evolução, atividade, músicas e participantes. */
export default function TeamReport() {
  const { version } = useData();
  const [period, setPeriod] = useState('week');
  const [offset, setOffset] = useState(0);
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    setR(null); setErr('');
    rpc('team_report', { p_version: version, p_period: period, p_offset: offset })
      .then((x) => alive && setR(x)).catch((e) => alive && setErr(tErr(e.message)));
    return () => { alive = false; };
  }, [version, period, offset]);

  const lc = locale();
  const fmtRange = () => {
    if (!r) return '';
    const s = new Date(r.start), e = new Date(new Date(r.end).getTime() - 1);
    if (period === 'day') return s.toLocaleDateString(lc, { weekday: 'short', day: '2-digit', month: 'short' });
    if (period === 'month') return s.toLocaleDateString(lc, { month: 'long', year: 'numeric' });
    return `${s.toLocaleDateString(lc, { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString(lc, { day: '2-digit', month: 'short' })}`;
  };
  const bucketLabel = (ts) => {
    const d = new Date(ts * 1000);
    if (period === 'day') return `${d.getHours()}h`;
    if (period === 'week') return d.toLocaleDateString(lc, { weekday: 'short' }).replace('.', '');
    return String(d.getDate());
  };
  const tt = r?.totals || {}, pv = r?.prev || {};
  const rate = (p, n) => (n ? Math.round((p / n) * 100) : null);

  return (
    <section className="card team-report">
      <h3 className="ic-row"><BarChart3 size={18} /> {t('Relatório do time')}</h3>
      <div className="tr-controls">
        <Chips value={period} onChange={(v) => { setPeriod(v); setOffset(0); }} options={PERIODS.map(([k, l]) => [k, t(l)])} />
        <div className="tr-nav">
          <button type="button" className="btn ghost icon" onClick={() => setOffset((o) => o + 1)} aria-label={t('Período anterior')}><ChevronLeft size={16} /></button>
          <span className="tr-range">{r ? fmtRange() : '…'}{offset === 0 && r && <small className="muted"> · {t('atual')}</small>}</span>
          <button type="button" className="btn ghost icon" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))} aria-label={t('Próximo período')}><ChevronRight size={16} /></button>
        </div>
      </div>
      {err && <div className="form-err">{err}</div>}
      {!r && !err && <p className="muted small">{t('Carregando…')}</p>}
      {r && (
        <>
          <div className="tr-kpis">
            <div className="tr-kpi"><small>{t('Jogadas')}</small><b>{fmtNum(tt.plays)}</b><Delta now={tt.plays} before={pv.plays} /></div>
            <div className="tr-kpi"><small>{t('Passes')}</small><b>{fmtNum(tt.passes)}</b><Delta now={tt.passes} before={pv.passes} /></div>
            <div className="tr-kpi"><small>{t('Taxa de passe')}</small><b>{rate(tt.passes, tt.plays) ?? '—'}{tt.plays ? '%' : ''}</b>
              {pv.plays ? <span className="muted tiny">{t('antes {n}%', { n: rate(pv.passes, pv.plays) })}</span> : null}</div>
            <div className="tr-kpi"><small>{t('Clears novos')}</small><b>{fmtNum(tt.new_clears)}</b><Delta now={tt.new_clears} before={pv.new_clears} /></div>
            <div className="tr-kpi"><small>{t('Jogando')}</small><b>{fmtNum(tt.active)}</b><Delta now={tt.active} before={pv.active} /></div>
            <div className="tr-kpi"><small>{t('Músicas diferentes')}</small><b>{fmtNum(tt.songs)}</b></div>
            <div className="tr-kpi"><small>{t('Nível médio jogado')}</small><b>{tt.avg_level ?? '—'}</b></div>
            <div className="tr-kpi"><small>{t('Maior passe')}</small>
              <b className="tr-max">{tt.max_d ? `D${tt.max_d}` : ''}{tt.max_d && tt.max_s ? ' · ' : ''}{tt.max_s ? `S${tt.max_s}` : ''}{!tt.max_d && !tt.max_s ? '—' : ''}</b></div>
          </div>

          {tt.plays > 0 ? (
            <>
              <h4>{t('Atividade')}</h4>
              <StackedBars bars={(r.series || []).map(([ts, ok, bad]) => ({ key: ts, label: bucketLabel(ts), parts: [ok, bad] }))}
                series={[{ name: t('Passou'), color: SERIES.a }, { name: t('Quebrou'), color: SERIES.b }]} label={t('Atividade')} />

              <h4>{t('Mais jogadas pelo time')}</h4>
              <ol className="tr-top">
                {r.top.map((x) => (
                  <li key={x.chart_id}>
                    <Link to={`/musica/${x.song_id}?c=${x.chart_id}`}>
                      <Ball chart={{ mode: x.mode, level: x.level }} size="sm" />
                      <span className="tr-title">{x.title}</span>
                      <span className="muted small">{t('{n}× · {p} passes · {k} jogadores', { n: x.plays, p: x.passes, k: x.players })}</span>
                    </Link>
                  </li>
                ))}
              </ol>

              <h4>{t('Por participante')}</h4>
              <div className="tr-table" role="table" aria-label={t('Por participante')}>
                <div className="tr-row head" role="row">
                  <span role="columnheader">{t('Jogador')}</span><span role="columnheader">{t('Jogadas')}</span>
                  <span role="columnheader">{t('Passe')}</span><span role="columnheader">{t('Novos')}</span><span role="columnheader">{t('Maior')}</span>
                </div>
                {r.members.map((m) => (
                  <div key={m.id} className={`tr-row ${m.plays ? '' : 'idle'}`} role="row">
                    <span className="tr-player" role="cell"><Avatar p={m} size={26} /><b>{m.nickname || t('Jogador')}</b></span>
                    <span role="cell">{fmtNum(m.plays)}</span>
                    <span role="cell">{m.plays ? `${rate(m.passes, m.plays)}%` : '—'}</span>
                    <span role="cell" className={m.new_clears ? 'good' : ''}>{m.new_clears || '—'}</span>
                    <span role="cell" className="small">{m.max_d ? `D${m.max_d}` : ''}{m.max_d && m.max_s ? ' ' : ''}{m.max_s ? `S${m.max_s}` : ''}{!m.max_d && !m.max_s ? '—' : ''}</span>
                  </div>
                ))}
              </div>
              <p className="muted tiny">{t('Clear novo = passou pela primeira vez no período. Comparação com o período anterior de mesmo tamanho. Conta só as jogadas sincronizadas.')}</p>
            </>
          ) : <p className="empty">{t('Ninguém do time jogou (ou sincronizou) neste período.')}</p>}
        </>
      )}
    </section>
  );
}

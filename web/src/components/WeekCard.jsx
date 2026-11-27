// Início: missões da semana, sequência de semanas jogadas e o resumo da semana passada.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { loadProgress, rpc } from '../lib/api.js';
import { chartAttempts, levelStats, parseProgress, playerLevel, weaknessSums, weaknesses } from '../lib/insights.js';
import { lastWeekSummary, weeklyMissions, weekStart, weekStreak } from '../lib/missions.js';
import { DIM_LABEL } from '../pages/Progress.jsx';
import { isOn } from '../lib/plans.js';
import { fmtNum, locale, t, tn } from '../lib/i18n.js';
import { Ball } from './ui.jsx';
import Panel from './Panel.jsx';
import { CalendarCheck, Check, ChevronRight, Flame, Swords, Trophy, X } from './Icons.jsx';

const SEEN_KEY = 'stepclub:week-summary-seen';
const fmtDay = (ms) => new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`;

function missionText(m) {
  const v = m.vars;
  switch (m.id) {
    case 'days': return t('Jogue em {n} dias diferentes', v);
    case 'clear_prev': return t('Passe {n} charts novos {m}{L}', v);
    case 'clear_target': return t('Passe 1 chart novo {m}{L}', v);
    case 'improve': return t('Melhore a nota em {n} charts que você já passou', v);
    case 'weak': return t('Jogue {n} charts com muito {p} (seu ponto fraco)', { ...v, p: t(DIM_LABEL[v.p] || v.p) });
    case 'plays': return t('Jogue {n} charts', v);
    default: return m.id;
  }
}

export default function WeekCard() {
  const { data, version, plan } = useData();
  const on = { missions: isOn(plan, 'missions'), streak: isOn(plan, 'streak'), summary: isOn(plan, 'week_summary') };
  const [raw, setRaw] = useState(null);
  const [week, setWeek] = useState(null);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } });

  const any = on.missions || on.streak || on.summary;
  useEffect(() => {
    if (!any) return undefined;
    let alive = true;
    loadProgress(version, data.lastSync || null).then((r) => { if (alive) setRaw(r); }).catch(() => {});
    rpc('my_week').then((w) => { if (alive) setWeek(w); }).catch(() => {});
    return () => { alive = false; };
  }, [version, data.lastSync, any]);

  const a = useMemo(() => {
    if (!raw) return null;
    const prog = parseProgress(raw, data);
    const attempts = chartAttempts(data, prog);
    const count = (m) => attempts.filter((r) => r.chart.mode === m).reduce((s, r) => s + r.attempts, 0);
    const mode = count('S') > count('D') ? 'S' : 'D';
    const lvl = playerLevel(levelStats(attempts, mode));
    const weak = lvl ? weaknesses(weaknessSums(attempts, prog, mode, lvl), new Map()) : [];
    const ctx = { prog, attempts, mode, lvl, weak };
    return { mode, now: weeklyMissions(ctx), last: { ...lastWeekSummary({ ...ctx, week }), showRival: isOn(plan, 'rival') } };
  }, [raw, data, week, plan]);

  const streak = week && on.streak ? weekStreak(week.weeks, week.week) : null;
  const lastKey = String(weekStart() - 7 * 86400000);
  const showSummary = on.summary && a && !a.last.empty && seen !== lastKey;
  const closeSummary = () => { try { localStorage.setItem(SEEN_KEY, lastKey); } catch { /* ignora */ } setSeen(lastKey); };

  if (!a || !any) return null;
  const { now } = a;
  const end = now.ws + 6 * 86400000;

  return (
    <>
      {showSummary && <LastWeek s={a.last} streak={streak} onClose={closeSummary} />}
      {(on.missions || streak) && <Panel id="home-missions" className="week-card"
        title={<span className="ic-row">{on.missions ? <><Trophy size={18} /> {t('Missões da semana')}</> : <><Flame size={18} /> {t('Sequência de semanas')}</>}
          {on.missions && <span className="muted small"> {now.done}/{now.total}</span>}</span>}
        extra={streak && (
          <span className={`streak ${streak.streak ? 'on' : ''}`} title={t('Semanas seguidas com pelo menos uma jogada. Recorde: {n}', { n: streak.best })}>
            <Flame size={16} /> {tn(streak.streak, '{n} semana', '{n} semanas')}
          </span>
        )}>
        {on.missions && <>
        <p className="muted small">
          {fmtDay(now.ws)}–{fmtDay(end)} · {t('{d} de {n} completas', { d: now.done, n: now.total })}
          {a.mode && <> · {a.mode === 'S' ? 'Single' : 'Double'}</>}
        </p>
        <div className="missions-bar"><span style={{ width: `${(now.done / now.total) * 100}%` }} /></div>
        <ul className="missions">
          {now.missions.map((m) => (
            <li key={m.id} className={m.done ? 'done' : ''}>
              <span className="mission-check">{m.done ? <Check size={14} /> : null}</span>
              <span className="mission-text">{missionText(m)}</span>
              <span className="mission-count">{m.cur}/{m.goal}</span>
            </li>
          ))}
        </ul>
        </>}
        {streak?.atRisk && <p className="small streak-warn"><Flame size={14} /> {tn(streak.streak, 'Jogue esta semana para não perder a sequência de {n} semana.', 'Jogue esta semana para não perder a sequência de {n} semanas.')}</p>}
        {on.missions && now.done === now.total && <p className="small mission-all"><Trophy size={14} /> {t('Semana completa! Novas missões na segunda.')}</p>}
        {on.missions && <p className="muted small">{t('As missões se completam sozinhas quando você sincroniza.')} <Link to="/progresso?v=plano">{t('Ver plano de treino')} <ChevronRight size={12} /></Link></p>}
        {!on.missions && streak && <p className="muted small">{t('Semanas seguidas com pelo menos uma jogada. Recorde: {n}', { n: streak.best })}</p>}
      </Panel>}
    </>
  );
}

function LastWeek({ s, streak, onClose }) {
  return (
    <section className="card week-summary">
      <div className="row-between">
        <h3 className="ic-row"><CalendarCheck size={18} /> {t('Sua semana passada')}</h3>
        <button className="link muted" aria-label={t('Fechar')} onClick={onClose}><X size={16} /></button>
      </div>
      <p className="muted small">{fmtDay(s.ws)}–{fmtDay(s.ws + 6 * 86400000)}</p>
      <div className="ws-grid">
        <div><b>{fmtNum(s.plays)}</b><small>{tn(s.days, 'jogadas em {n} dia', 'jogadas em {n} dias')}</small></div>
        <div><b>{fmtNum(s.clears)}</b><small>{t('charts novos passados')}</small></div>
        <div><b>{fmtNum(s.improved)}</b><small>{t('notas melhores')}</small></div>
        <div><b>{s.missions.done}/{s.missions.total}</b><small>{t('missões')}</small></div>
        {s.pb && <div><b className={s.pb.delta > 0 ? 'up' : s.pb.delta < 0 ? 'down' : ''}>{signed(s.pb.delta)}</b><small>PUMBILITY</small></div>}
        {streak && <div><b><Flame size={16} /> {streak.streak}</b><small>{t('semanas seguidas')}</small></div>}
      </div>
      {s.topClears.length > 0 && (
        <div className="ws-clears">
          <small className="muted">{t('Destaques')}</small>
          {s.topClears.map((c) => (
            <Link key={c.id} to={`/chart/${c.id}`} className="ws-clear"><Ball chart={c} size="sm" /><span>{c.song.title}</span></Link>
          ))}
        </div>
      )}
      {s.rival && s.showRival && (
        <p className="small ic-row ws-rival">
          <Swords size={14} />
          {s.rival.delta != null && s.pb
            ? (s.rival.delta > s.pb.delta
              ? t('{n} subiu {r} no PUMBILITY, mais que você ({v}). Hora de reagir!', { n: s.rival.nickname, r: signed(s.rival.delta), v: signed(s.pb.delta) })
              : t('Você subiu mais que {n} no PUMBILITY ({v} contra {r}).', { n: s.rival.nickname, r: signed(s.rival.delta), v: signed(s.pb.delta) }))
            : t('{n} fez {p} jogadas na semana.', { n: s.rival.nickname, p: s.rival.plays })}
          <Link to="/progresso?v=rival">{t('Ver rival')}</Link>
        </p>
      )}
    </section>
  );
}

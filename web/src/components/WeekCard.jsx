// Início: missões da semana (personalizadas e congeladas na semana), foco, troca de missão, selos,
// sequência de semanas jogadas e o resumo da semana passada.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { loadProgress, rpc } from '../lib/api.js';
import { chartAttempts, levelStats, parseProgress, playerLevel, weaknessSums, weaknesses } from '../lib/insights.js';
import {
  adjustFactor, badgeName, FOCUS, focusOptions, friendSuggestions, generateMissions, hashSeed, lastWeekSummary, missionConfig, missionCtx,
  missionProgress, pointsFor, pointsOn, rerollMission, TIERS, weekKey, weekStart, weekStreak,
} from '../lib/missions.js';
import { loadTraining } from '../lib/training.js';
import { DIM_LABEL } from '../pages/Progress.jsx';
import { entitlements, isOn } from '../lib/plans.js';
import { useQuiz } from '../lib/quiz.js';
import { fmtNum, locale, t, tErr, tn } from '../lib/i18n.js';
import { Ball } from './ui.jsx';
import Panel from './Panel.jsx';
import { Award, CalendarCheck, Check, ChevronDown, ChevronRight, Flame, Shuffle, Star, Swords, Target, Trophy, X } from './Icons.jsx';

const SEEN_KEY = 'stepclub:week-summary-seen';
const LOCAL_KEY = 'pumpstat:missions:';
const DAY = 86400000;
const fmtDay = (ms) => new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`;
const TIER_LABEL = Object.fromEntries(TIERS);
// missões em que os charts mostrados são sugestões (a missão vale para qualquer chart do tipo)
const SUGGEST = new Set(['clear_prev', 'clear_target', 'weak', 'training', 'event', 'new_songs', 'gimmick']);

export function missionText(m) {
  const v = m.vars || {};
  switch (m.type || m.id) {
    case 'days': return tn(v.n, 'Jogue em {n} dia', 'Jogue em {n} dias diferentes');
    case 'plays': return t('Jogue {n} charts', v);
    case 'explore': return tn(v.n, 'Jogue {n} chart que você nunca jogou', 'Jogue {n} charts que você nunca jogou');
    case 'checkin': return v.n > 1 ? t('Entre na fila de um fliperama pelo app em {n} dias', v) : t('Entre na fila de um fliperama pelo app');
    case 'clear_prev': case 'clear_target':
      return v.n > 1 ? t('Passe {n} charts novos {m}{L}', v) : t('Passe 1 chart novo {m}{L}', v);
    case 'near_clear': return (m.charts || []).length > 1 ? t('Passe um destes charts que você já tentou e ainda não passou') : t('Passe este chart que você já tentou e ainda não passou');
    case 'improve': return t('Melhore a nota em {n} charts que você já passou', v);
    case 'grade_up': return t('Chegue à próxima nota em um destes charts');
    case 'plate_up': return t('Melhore a plate de um destes charts');
    case 'pumbility': return t('Suba seu PUMBILITY: chegue à próxima nota em um destes charts');
    case 'weak': return t('Jogue {n} charts com muito {p} (seu ponto fraco)', { ...v, p: t(DIM_LABEL[v.p] || v.p) });
    case 'training': return t('Jogue {n} charts do seu Meu treino', v);
    case 'friend_chart': return v.n > 1 ? t('Jogue {n} charts que seus amigos jogaram esta semana', v) : t('Jogue um chart que um amigo jogou esta semana');
    case 'rival_clear': return t('Passe um chart que {r} já passou e você não', { r: v.r || t('seu rival') });
    case 'event': return `${v.title ? `${v.title}: ` : ''}${tn(v.n, 'jogue {n} chart do evento', 'jogue {n} charts do evento')}`;
    case 'new_songs': return t('Jogue {n} charts de músicas novas da Phoenix 2', v);
    case 'gimmick': return t('Jogue {n} charts com gimmick', v);
    default: return m.type || m.id;
  }
}

/** Charts citados na missão, com a informação extra de cada um. */
function missionCharts(m, data, ctx) {
  const by = (id) => data.byId.get(id);
  if (m.type === 'friend_chart') return friendSuggestions(ctx).map(({ c, nick }) => ({ c, extra: nick }));
  if (m.targets) {
    return m.targets.map((x) => {
      const c = by(x.id);
      if (!c) return null;
      if (m.type === 'plate_up') return { c, extra: `${x.from || c.plate || ''} → ${x.p}` };
      const need = x.s - (c.score || 0);
      return { c, extra: need > 0 ? `${x.g} · ${t('faltam {n}', { n: fmtNum(need) })}` : `${x.g} ✓`, ok: need <= 0 };
    }).filter(Boolean);
  }
  return (m.charts || []).map((id) => {
    const c = by(id);
    if (!c) return null;
    if (m.type === 'near_clear') { const f = m.meta?.fails?.[id]; return { c, extra: f ? tn(f, '{n} quebra', '{n} quebras') : null }; }
    return { c };
  }).filter(Boolean);
}

export default function WeekCard() {
  const { data, version, setVersion, plan, session } = useData();
  const cfg = useMemo(() => missionConfig(plan), [plan]);
  // a Phoenix 1 não recebe jogadas novas: missões e resumo da semana só valem na Phoenix 2
  const p2 = version === 'phoenix2';
  const on = { missions: p2 && isOn(plan, 'missions'), streak: isOn(plan, 'streak'), summary: p2 && isOn(plan, 'week_summary') && entitlements(plan).can('week_summary') };
  const p1Note = !p2 && isOn(plan, 'missions');
  const uid = session?.user?.id || 'anon';
  const ws = weekStart();
  const wk = weekKey(ws);
  const [raw, setRaw] = useState(null);
  const [week, setWeek] = useState(null);
  const [mctx, setMctx] = useState(null);
  const [training, setTraining] = useState(null);
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [openFocus, setOpenFocus] = useState(false);
  const [newBadges, setNewBadges] = useState([]);
  const [points, setPoints] = useState(null);
  const sent = useRef(null);
  const quizState = useQuiz();
  const quiz = quizState?.quiz || null;
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } });

  const any = on.missions || on.streak || on.summary;
  useEffect(() => {
    if (!any) return undefined;
    let alive = true;
    loadProgress(version, data.lastSync || null).then((r) => { if (alive) setRaw(r); }).catch(() => {});
    rpc('my_week').then((w) => { if (alive) setWeek(w); }).catch(() => {});
    return () => { alive = false; };
  }, [version, data.lastSync, any]);
  useEffect(() => {
    if (!on.missions) return undefined;
    let alive = true;
    rpc('missions_ctx', { p_week: wk }).then((c) => { if (alive) setMctx(c || {}); }).catch(() => { if (alive) setMctx({ offline: true }); });
    const tr = isOn(plan, 'training') ? loadTraining().then((m) => [...m.keys()]).catch(() => []) : Promise.resolve([]);
    tr.then((ids) => { if (alive) setTraining(ids); });
    if (session?.user?.id && pointsOn(cfg)) rpc('points_of', { p_user: session.user.id }).then((n) => { if (alive) setPoints(n); }).catch(() => {});
    return () => { alive = false; };
  }, [wk, on.missions, data.lastSync]); // eslint-disable-line

  const base = useMemo(() => {
    if (!raw) return null;
    const prog = parseProgress(raw, data);
    const attempts = chartAttempts(data, prog);
    const count = (m) => attempts.filter((r) => r.chart.mode === m).reduce((s, r) => s + r.attempts, 0);
    // modo: o que mais joga; quem respondeu Single ou Double no questionário e ainda tem pouco histórico fica no escolhido
    const total = count('S') + count('D');
    const mode = (quiz?.mode === 'S' || quiz?.mode === 'D') && (total < 30 || count(quiz.mode) > 0) ? quiz.mode : count('S') > count('D') ? 'S' : 'D';
    const lvl = playerLevel(levelStats(attempts, mode));
    const weak = lvl ? weaknesses(weaknessSums(attempts, prog, mode, lvl), new Map()) : [];
    return { prog, attempts, mode, lvl, weak };
  }, [raw, data, quiz]);

  const mkCtx = () => missionCtx({ ...base, mode: row?.mode || base.mode, data, version, training: training || [], social: mctx, past: mctx?.past, cfg, ws, quiz });

  // missões da semana: as guardadas ou, na primeira abertura, geradas e guardadas
  useEffect(() => {
    if (!on.missions || !base || !mctx || training == null || row) return;
    if (mctx.row) { setRow(mctx.row); return; }
    const ctx = missionCtx({ ...base, data, version, training, social: mctx, past: mctx.past, cfg, ws, quiz });
    const defs = generateMissions(ctx, { focus: 'auto', seed: hashSeed(`${uid}:${wk}:auto`) });
    const local = { week: wk, missions: defs, focus: 'auto', rerolls: 0, focus_changes: 0, mode: base.mode, offline: true };
    const offline = () => {
      // sem servidor: guarda no aparelho para as missões não mudarem durante a semana
      try {
        const saved = JSON.parse(localStorage.getItem(LOCAL_KEY + wk) || 'null');
        if (saved?.missions?.length) { setRow({ ...saved, offline: true }); return; }
        localStorage.setItem(LOCAL_KEY + wk, JSON.stringify(local));
      } catch { /* ignora */ }
      setRow(local);
    };
    if (mctx.offline) { offline(); return; }
    rpc('set_week_missions', { p_week: wk, p_mode: base.mode, p_focus: 'auto', p_missions: defs, p_action: 'init' }).then(setRow).catch(offline);
  }, [on.missions, base, mctx, training, row]); // eslint-disable-line

  const live = useMemo(() => {
    if (!row || !base || !mctx) return null;
    const ctx = mkCtx();
    return { ctx, missions: missionProgress(row.missions || [], ctx) };
  }, [row, base, mctx, training, data]); // eslint-disable-line

  // manda o progresso (o servidor fecha a semana e dá os selos)
  useEffect(() => {
    if (!live || !row || row.offline) return;
    const prog = live.missions.map((m) => m.cur);
    const done = live.missions.filter((m) => m.done).length;
    const key = JSON.stringify(prog);
    const complete = done === live.missions.length;
    if (sent.current === key || (key === JSON.stringify(row.progress || []) && (!complete || row.completed_at))) return;
    sent.current = key;
    rpc('report_week_progress', { p_week: wk, p_progress: prog, p_done: done }).then((r) => {
      if (r?.new?.length) setNewBadges(r.new);
      if (r?.points_total != null) setPoints(r.points_total);
      setRow((x) => (x ? { ...x, progress: prog, done, completed_at: r?.completed ? (x.completed_at || new Date().toISOString()) : x.completed_at } : x));
    }).catch(() => { sent.current = null; });
  }, [live]); // eslint-disable-line

  const reroll = async (i) => {
    setErr('');
    const defs = rerollMission(mkCtx(), row.missions, i, { focus: row.focus, seed: hashSeed(`${uid}:${wk}:r${(row.rerolls || 0) + 1}:${i}`) });
    if (!defs) { setErr(t('Não há outra missão disponível para trocar agora.')); return; }
    setBusy(true);
    try { setRow(await rpc('set_week_missions', { p_week: wk, p_mode: row.mode || base.mode, p_focus: row.focus, p_missions: defs, p_action: 'reroll' })); sent.current = null; } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const changeFocus = async (f) => {
    setOpenFocus(false);
    if (f === row.focus) return;
    setErr(''); setBusy(true);
    const defs = generateMissions(missionCtx({ ...base, data, version, training: training || [], social: mctx, past: mctx.past, cfg, ws, quiz }), { focus: f, seed: hashSeed(`${uid}:${wk}:${f}`) });
    try { setRow(await rpc('set_week_missions', { p_week: wk, p_mode: base.mode, p_focus: f, p_missions: defs, p_action: 'focus' })); sent.current = null; } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };

  const prevKey = weekKey(ws - 7 * DAY);
  const lastRow = (mctx?.past || []).find((p) => p.week === prevKey) || null;
  const last = useMemo(() => (base ? { ...lastWeekSummary({ ...base, week, lastRow }), showRival: isOn(plan, 'rival') } : null), [base, week, lastRow, plan]);
  const streak = week && on.streak ? weekStreak(week.weeks, week.week) : null;
  const lastKey = String(ws - 7 * DAY);
  const showSummary = on.summary && last && !last.empty && seen !== lastKey;
  const closeSummary = () => { try { localStorage.setItem(SEEN_KEY, lastKey); } catch { /* ignora */ } setSeen(lastKey); };

  if (p1Note && !on.streak) return <P1Note onSwitch={() => setVersion?.('phoenix2')} />;
  if (!any || !base) return p1Note ? <P1Note onSwitch={() => setVersion?.('phoenix2')} /> : null;
  const ms = live?.missions || [];
  const done = ms.filter((m) => m.done).length;
  const total = ms.length;
  const rerollsLeft = row && !row.offline ? Math.max(0, (Number(cfg.rerolls) || 0) - (row.rerolls || 0)) : 0;
  const focusLeft = row && !row.offline && cfg.focus !== false ? Math.max(0, (Number(cfg.focus_changes) || 0) - (row.focus_changes || 0)) : 0;
  const adj = mctx?.past ? adjustFactor(mctx.past, cfg).why : null;
  const focus = FOCUS.find(([id]) => id === (row?.focus || 'auto')) || FOCUS[0];
  const end = ws + 6 * DAY;

  return (
    <>
      {showSummary && <LastWeek s={last} streak={streak} onClose={closeSummary} />}
      {(on.missions || streak) && <Panel id="home-missions" className="week-card"
        title={<span className="ic-row">{on.missions ? <><Trophy size={18} /> {t('Missões da semana')}</> : <><Flame size={18} /> {t('Sequência de semanas')}</>}
          {on.missions && total > 0 && <span className="muted small"> {done}/{total}</span>}</span>}
        extra={(streak || (on.missions && pointsOn(cfg) && points != null)) && <span className="week-extra">
          {on.missions && pointsOn(cfg) && points != null && <span className="mission-points" title={t('Pontos que você ganhou completando missões')}><Star size={13} /> {fmtNum(points)}</span>}
          {streak && (
            <span className={`streak ${streak.streak ? 'on' : ''}`} title={t('Semanas seguidas com pelo menos uma jogada. Recorde: {n}', { n: streak.best })}>
              <Flame size={16} /> {tn(streak.streak, '{n} semana', '{n} semanas')}
            </span>
          )}
        </span>}>
        {on.missions && !live && <p className="muted small">{t('Montando suas missões…')}</p>}
        {on.missions && live && <>
          <div className="mission-head">
            <p className="muted small">{fmtDay(ws)}–{fmtDay(end)} · {t('{d} de {n} completas', { d: done, n: total })}
              {row?.mode && <> · {row.mode === 'S' ? 'Single' : 'Double'}</>}</p>
            {cfg.focus !== false && !row?.offline && (
              <button className={`mission-focus-btn ${openFocus ? 'on' : ''}`} disabled={busy || (!focusLeft && !openFocus)}
                onClick={() => setOpenFocus((o) => !o)} title={focusLeft ? t('Escolher o foco da semana') : t('Você já trocou o foco esta semana')}>
                <Target size={13} /> {t(focus[1])}{focusLeft > 0 && <ChevronDown size={12} />}
              </button>
            )}
          </div>
          {openFocus && (
            <div className="mission-focus">
              <p className="muted tiny">{t('O foco muda as missões desta semana. Dá para trocar {n}x por semana.', { n: cfg.focus_changes })}</p>
              {focusOptions(cfg).map(([id, label, desc]) => (
                <button key={id} className={`mf-opt ${id === focus[0] ? 'on' : ''}`} onClick={() => changeFocus(id)} disabled={busy}>
                  <b>{t(label)}</b><small className="muted">{t(desc)}</small>
                </button>
              ))}
            </div>
          )}
          <div className="missions-bar"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
          <ul className="missions">
            {ms.map((m, i) => {
              const chips = missionCharts(m, data, live.ctx);
              return (
                <li key={`${m.type}-${i}`} className={m.done ? 'done' : ''}>
                  <span className="mission-check">{m.done ? <Check size={14} /> : null}</span>
                  <div className="mission-body">
                    <div className="mission-line">
                      <span className={`mission-tier t-${m.tier}`}>{t(TIER_LABEL[m.tier] || '')}</span>
                      <span className="mission-text">{missionText(m)}</span>
                    </div>
                    {chips.length > 0 && !m.done && (
                      <div className="mission-charts">
                        {SUGGEST.has(m.type) && <small className="muted">{t('Sugestões')}</small>}
                        {chips.map(({ c, extra, ok }) => (
                          <Link key={c.id} to={`/chart/${c.id}`} className={`mission-chart ${ok ? 'ok' : ''}`}>
                            <Ball chart={c} size="sm" /><span className="mc-title">{c.song.title}</span>{extra && <em>{extra}</em>}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="mission-count">{m.cur}/{m.goal}{pointsOn(cfg) && <small className={`mission-pts ${m.done ? 'on' : ''}`}>+{pointsFor(cfg, m.tier)}</small>}</span>
                  {rerollsLeft > 0 && !m.done && (
                    <button className="link muted mission-reroll" disabled={busy} onClick={() => reroll(i)}
                      aria-label={t('Trocar missão')} title={tn(rerollsLeft, 'Trocar esta missão ({n} troca restante)', 'Trocar esta missão ({n} trocas restantes)')}>
                      <Shuffle size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {err && <p className="form-err small">{err}</p>}
          {adj === 'ease' && <p className="muted tiny">{t('Metas um pouco mais leves esta semana, depois de duas semanas difíceis.')}</p>}
          {adj === 'harder' && <p className="muted tiny">{t('Metas um pouco mais puxadas: você fechou a semana passada rapidinho.')}</p>}
        </>}
        {newBadges.length > 0 && cfg.badges !== false && (
          <div className="mission-badges-new">
            {newBadges.map(([b, l]) => <p key={`${b}${l}`} className="small ic-row"><Award size={16} /> {t('Selo novo: {b}', { b: badgeName(cfg, b, l, t) })}</p>)}
            <Link className="small" to={`/jogador/${uid}`}>{t('Ver no perfil')} <ChevronRight size={12} /></Link>
          </div>
        )}
        {streak?.atRisk && <p className="small streak-warn"><Flame size={14} /> {tn(streak.streak, 'Jogue esta semana para não perder a sequência de {n} semana.', 'Jogue esta semana para não perder a sequência de {n} semanas.')}</p>}
        {on.missions && total > 0 && done === total && <p className="small mission-all"><Trophy size={14} /> {t('Semana completa! Novas missões na segunda.')}{pointsOn(cfg) && <> {t('+{n} pts de bônus.', { n: pointsFor(cfg, 'week') })}</>}</p>}
        {on.missions && total > 0 && done < total && pointsOn(cfg) && pointsFor(cfg, 'week') > 0 && <p className="muted tiny">{t('Complete todas para ganhar +{n} pts de bônus.', { n: pointsFor(cfg, 'week') })}</p>}
        {on.missions && <p className="muted small">{t('As missões se completam sozinhas quando você sincroniza.')} <Link to="/progresso?v=plano">{t('Ver plano de treino')} <ChevronRight size={12} /></Link></p>}
        {!on.missions && streak && <p className="muted small">{t('Semanas seguidas com pelo menos uma jogada. Recorde: {n}', { n: streak.best })}</p>}
        {p1Note && <p className="small p1-note">{t('As missões da semana valem só na Phoenix 2, porque a Phoenix 1 não recebe jogadas novas.')} <button className="link" onClick={() => setVersion?.('phoenix2')}>{t('Ver na Phoenix 2')}</button></p>}
      </Panel>}
    </>
  );
}

function P1Note({ onSwitch }) {
  return (
    <section className="card week-card">
      <h3 className="ic-row"><Trophy size={18} /> {t('Missões da semana')}</h3>
      <p className="muted small">{t('As missões da semana valem só na Phoenix 2, porque a Phoenix 1 não recebe jogadas novas.')}</p>
      <button className="btn ghost" onClick={onSwitch}>{t('Ver na Phoenix 2')}</button>
    </section>
  );
}

function LastWeek({ s, streak, onClose }) {
  return (
    <section className="card week-summary">
      <div className="row-between">
        <h3 className="ic-row"><CalendarCheck size={18} /> {t('Sua semana passada')}</h3>
        <button className="link muted" aria-label={t('Fechar')} onClick={onClose}><X size={16} /></button>
      </div>
      <p className="muted small">{fmtDay(s.ws)}–{fmtDay(s.ws + 6 * DAY)}</p>
      <div className="ws-grid">
        <div><b>{fmtNum(s.plays)}</b><small>{tn(s.days, 'jogadas em {n} dia', 'jogadas em {n} dias')}</small></div>
        <div><b>{fmtNum(s.clears)}</b><small>{t('charts novos passados')}</small></div>
        <div><b>{fmtNum(s.improved)}</b><small>{t('notas melhores')}</small></div>
        {s.missions && <div><b>{s.missions.done}/{s.missions.total}</b><small>{t('missões')}</small></div>}
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

/** Pontos e selos do jogador (perfil). Cada um pode ser desligado pelo admin. */
export function Badges({ userId }) {
  const { plan, session } = useData();
  const cfg = useMemo(() => missionConfig(plan), [plan]);
  const [list, setList] = useState(null);
  const [pts, setPts] = useState(null);
  const showBadges = cfg.badges !== false;
  const showPoints = pointsOn(cfg);
  useEffect(() => {
    if (!session || !userId) return undefined;
    let alive = true;
    if (showBadges) rpc('badges_of', { p_user: userId }).then((r) => { if (alive) setList(r || []); }).catch(() => {});
    if (showPoints) rpc('points_of', { p_user: userId }).then((n) => { if (alive) setPts(n); }).catch(() => {});
    return () => { alive = false; };
  }, [userId, session, showBadges, showPoints]);
  if (!(showBadges && list?.length) && !(showPoints && pts > 0)) return null;
  return (
    <div className="badges">
      {showPoints && pts > 0 && <span className="badge-chip b-points" title={t('Pontos ganhos completando missões')}><Star size={13} /> {t('{n} pts', { n: fmtNum(pts) })}</span>}
      {showBadges && ['weeks', 'streak'].map((k) => (list || []).filter(([b]) => b === k).sort((x, y) => y[1] - x[1])[0]).filter(Boolean).map(([b, l, at]) => (
        <span key={`${b}${l}`} className={`badge-chip b-${b}`} title={new Date(at * 1000).toLocaleDateString(locale())}>
          {b === 'streak' ? <Flame size={13} /> : <Award size={13} />} {badgeName(cfg, b, l, t)}
        </span>
      ))}
    </div>
  );
}

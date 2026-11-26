import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { cachedVersion, fetchVersion, loadProgress } from '../lib/api.js';
import {
  chartAttempts, clearTimeline, levelStats, parseProgress, patternShare, PATTERNS, playerLevel, playsPerWeek, tips as makeTips, trainingPlan, weaknessSums, weaknesses,
} from '../lib/insights.js';
import Rival from './Rival.jsx';
import TopPlayed from '../components/TopPlayed.jsx';
import { TrainingAddChip } from '../components/TrainingToggle.jsx';
import { recommendations } from '../lib/recommend.js';
import { chartLabel, fmtScore, VERSIONS } from '../lib/piu.js';
import { STYLE_KEYS } from '../lib/style.js';
import { entitlements, isOn } from '../lib/plans.js';
import { fmtNum, locale, t, tn } from '../lib/i18n.js';
import { Ball, Jacket } from '../components/ui.jsx';
import { ChartTable, Donut, LineChart, SERIES, StackedBars } from '../components/MiniChart.jsx';
import { Chips } from './Songs.jsx';
import { Check, Crown, Lock, Target } from '../components/Icons.jsx';

export const DIM_LABEL = Object.fromEntries([...STYLE_KEYS.map((k) => [k.id, k.label]), ['speed', 'Velocidade'], ['stamina', 'Resistência'], ['gimmick', 'Gimmick']]);
export const DIM_TIP = {
  twist: 'Gire o quadril e mantenha o tronco de frente para a tela; comece pelos twists mais lentos.',
  drill: 'Relaxe o tornozelo e use o peso do corpo: o drill sai do quadril, não da perna inteira.',
  run: 'Fique no centro do pad com passos curtos e respire no ritmo da música.',
  bracket: 'Pise com o calcanhar numa seta e a ponta do pé na outra; treine primeiro os brackets parados.',
  jump: 'Pule baixo e aterrisse já pronto para a próxima seta.',
  jack: 'Use o tornozelo, não a perna toda, e não afaste o pé do painel entre as notas.',
  doublestep: 'Leia antes: doublestep pede o mesmo pé duas vezes seguidas; não alterne no automático.',
  footswitch: 'Prepare a troca de pé com antecedência e troque deslizando, sem pular.',
  speed: 'Charts rápidos pedem leitura: aumente o speed e treine charts rápidos um nível abaixo.',
  stamina: 'Resistência: jogue sequências sem pausa, controle a respiração e use a barra quando cansar.',
  gimmick: 'Gimmick pede leitura, não força: assista ao vídeo antes, decore os trechos de mudança de velocidade e paradas, e jogue com um speed confortável.',
};
const dimName = (p) => t(DIM_LABEL[p] || p);
const fmtWeek = (ms) => new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
const fmtMonth = (ms) => new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: 'short' });

const loadProg = (v) => loadProgress(v);

export default function Progress() {
  const { data, version, plan } = useData();
  const ent = entitlements(plan);
  const [params, setParams] = useSearchParams();
  const tab = params.get('v') || 'evolucao';
  const otherV = version === 'phoenix2' ? 'phoenix' : 'phoenix2';
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setRaw(null);
    Promise.all([
      loadProg(version), loadProg(otherV).catch(() => null),
      Promise.resolve(cachedVersion(otherV)).then((d) => d || fetchVersion(otherV)).catch(() => null),
    ]).then(([cur, oth, othData]) => { if (alive) setRaw({ cur, oth, othData }); }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [version, otherV]);

  const a = useMemo(() => {
    if (!raw) return null;
    const prog = parseProgress(raw.cur, data);
    const attempts = chartAttempts(data, prog);
    const oth = raw.oth && raw.othData ? (() => { const p = parseProgress(raw.oth, raw.othData); return { prog: p, attempts: chartAttempts(raw.othData, p) }; })() : null;
    const count = (m) => attempts.filter((r) => r.chart.mode === m).reduce((s, r) => s + r.attempts, 0);
    return { prog, attempts, oth, mainMode: count('S') > count('D') ? 'S' : 'D' };
  }, [raw, data]);

  const mode = params.get('m') || a?.mainMode || 'D';
  const set = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  const r = useMemo(() => {
    if (!a) return null;
    const stats = levelStats(a.attempts, mode);
    const lvl = playerLevel(stats);
    const othLvl = a.oth ? playerLevel(levelStats(a.oth.attempts, mode)) : null;
    const weak = weaknesses(weaknessSums(a.attempts, a.prog, mode, lvl), a.oth ? weaknessSums(a.oth.attempts, a.oth.prog, mode, othLvl) : new Map());
    const s1 = patternShare(a.attempts, a.prog, mode, lvl), s2 = a.oth ? patternShare(a.oth.attempts, a.oth.prog, mode, othLvl) : { pass: {}, fail: {} };
    const sum = (x, y) => Object.fromEntries(PATTERNS.map((p) => [p, (x[p] || 0) + (y[p] || 0)]));
    const share = { pass: sum(s1.pass, s2.pass), fail: sum(s1.fail, s2.fail) };
    const tipList = makeTips(data, a.prog, a.attempts, mode, lvl, weak);
    const recs = recommendations(version, data.charts);
    const planW = trainingPlan(version, data, a.prog, a.attempts, mode, lvl, weak, [...recs.improve, ...recs.fresh]);
    return { stats, lvl, weak, tipList, plan: planW, share };
  }, [a, mode, data, version]);

  return (
    <div className="page progress">
      <h2>{t('Seu progresso')}</h2>
      <div className="filters">
        <Chips value={tab} onChange={(v) => set('v', v)}
          options={[['evolucao', t('Evolução')], ['top', t('Mais jogadas')], ['fracos', t('Pontos fortes e fracos')], ['dicas', t('Dicas')], ['plano', t('Plano de treino')], ...(isOn(plan, 'rival') ? [['rival', t('Rival')]] : [])]} />
        {tab !== 'rival' && <Chips value={mode} onChange={(v) => set('m', v)} options={[['S', 'Single'], ['D', 'Double']]} />}
      </div>
      {err && <div className="form-err">{err}</div>}
      {!r && !err && tab !== 'rival' && <p className="empty">{t('Carregando…')}</p>}
      {r && tab === 'evolucao' && (ent.can('evolution_chart') ? <Evolution a={a} r={r} mode={mode} /> : <Locked />)}
      {a && tab === 'top' && <TopPlayed plays={a.prog.plays} mode={mode} />}
      {r && tab === 'fracos' && (ent.can('weakness') ? <Weak r={r} mode={mode} hasOther={!!a.oth} otherName={VERSIONS[otherV].name} /> : <Locked />)}
      {r && tab === 'dicas' && (ent.can('tips') ? <Tips r={r} mode={mode} /> : <Locked />)}
      {r && tab === 'plano' && (ent.can('training_plan') ? <Plan r={r} /> : <Locked />)}
      {tab === 'rival' && isOn(plan, 'rival') && (ent.can('rival') ? <Rival /> : <Locked />)}
    </div>
  );
}

export function Locked() {
  return (
    <section className="card locked-card">
      <Lock size={20} />
      <p>{t('Este recurso faz parte dos planos pagos.')}</p>
      <Link className="btn" to="/planos"><Crown size={15} /> {t('Ver planos')}</Link>
    </section>
  );
}

function LevelSummary({ lvl, mode }) {
  if (!lvl) return <p className="empty">{t('Passe alguns charts neste modo para começar a análise.')}</p>;
  return (
    <section className="lvl-summary">
      <div><span className="muted small">{t('Maior nível passado')}</span><Ball chart={{ mode, level: lvl.ceiling }} size="sm" /></div>
      <div><span className="muted small">{t('Nível de conforto')}</span><Ball chart={{ mode, level: lvl.comfort }} size="sm" /></div>
      <div><span className="muted small">{t('Próximo alvo')}</span><Ball chart={{ mode, level: lvl.target }} size="sm" /></div>
    </section>
  );
}

// ---------- Evolução ----------
function Evolution({ a, r, mode }) {
  const { data } = useData();
  const pb = (data.pumbilityHistory || []).map(([at, v]) => ({ x: Date.parse(at), y: Number(v) }));
  const timeline = clearTimeline(a.attempts, mode);
  const weeks = playsPerWeek(a.prog, mode);
  const lv = r.stats.filter((s) => s.level >= 10);
  return (
    <>
      <LevelSummary lvl={r.lvl} mode={mode} />

      <section className="card">
        <h3>PUMBILITY</h3>
        {pb.length >= 2 ? (
          <>
            <LineChart points={pb} color={SERIES.gold} fmtY={(v) => fmtNum(Math.round(v))} fmtX={fmtMonth} label="PUMBILITY" />
            <ChartTable head={[t('Data'), 'PUMBILITY']} rows={pb.map((p) => [fmtMonth(p.x), fmtNum(p.y)])} />
          </>
        ) : <p className="muted small">{t('O gráfico aparece a partir da segunda sincronização.')}</p>}
      </section>

      <section className="card">
        <h3>{t('Clears acumulados')}</h3>
        {timeline.length >= 2 ? (
          <>
            <LineChart points={timeline.map((w) => ({ x: w.at, y: w.total, note: t('maior nível: {l}', { l: chartLabel({ mode, level: w.maxLv }) }) }))}
              color={SERIES.a} fmtY={(v) => fmtNum(v)} fmtX={fmtWeek} step label={t('Clears acumulados')} />
            <p className="muted tiny">{t('Clears anteriores ao seu primeiro sync aparecem juntos na data em que o PIU Stats os viu pela primeira vez.')}</p>
          </>
        ) : <p className="muted small">{t('Ainda não há semanas suficientes para o gráfico.')}</p>}
      </section>

      <section className="card">
        <h3>{t('Charts passados por nível')}</h3>
        <p className="muted small">{t('De todos os charts que você já tentou em cada nível, quantos passou e quantos ainda não.')}</p>
        <StackedBars bars={lv.map((s) => ({ key: s.level, label: String(s.level), parts: [s.cleared, s.charts - s.cleared],
          note: t('{p}% passados · {f} quebras em {n} tentativas', { p: Math.round((s.cleared / s.charts) * 100), f: s.fails, n: s.attempts }) }))}
          series={[{ name: t('Passou'), color: SERIES.a }, { name: t('Ainda não passou'), color: SERIES.b }]} label={t('Charts passados por nível')} />
        <ChartTable head={[t('Nível'), t('Passou'), t('Ainda não passou'), t('Quebras'), t('Tentativas')]}
          rows={lv.map((s) => [chartLabel({ mode, level: s.level }), s.cleared, s.charts - s.cleared, s.fails, s.attempts])} />
      </section>

      <section className="card">
        <h3>{t('Tentativas por semana')}</h3>
        {weeks.length ? (
          <>
            <StackedBars bars={weeks.map((w) => ({ key: w.at, label: fmtWeek(w.at), parts: [w.pass, w.fail] }))}
              series={[{ name: t('Passou'), color: SERIES.a }, { name: t('Quebrou'), color: SERIES.b }]} label={t('Tentativas por semana')} />
            <p className="muted tiny">{t('O site da Pump guarda só as suas 50 últimas jogadas: sincronize depois de jogar para não perder histórico.')}</p>
          </>
        ) : <p className="muted small">{t('Nenhuma jogada registrada ainda.')}</p>}
      </section>
    </>
  );
}

// ---------- Gráficos de setor: onde você passa e onde você quebra ----------
// cor fixa por padrão (a cor segue o padrão, nunca a posição), paleta validada para fundo escuro
const PATTERN_COLOR = { twist: '#338ced', drill: '#e76624', run: '#00a888', bracket: '#d28e05', jump: '#e24d8b', jack: '#0aac23', doublestep: '#9887ef', footswitch: '#eb6263' };
function slicesOf(counts) {
  const total = Object.values(counts).reduce((a, v) => a + v, 0);
  if (!total) return [];
  const big = Object.entries(counts).filter(([, v]) => v / total >= 0.04).sort((a, b) => b[1] - a[1]);
  const rest = total - big.reduce((a, [, v]) => a + v, 0);
  return [...big.map(([p, v]) => ({ key: p, name: dimName(p), value: v, color: PATTERN_COLOR[p] })),
    ...(rest > 0 ? [{ key: 'other', name: t('Outros'), value: rest, color: '#6b6f78' }] : [])];
}
function ShareDonuts({ share }) {
  const pass = slicesOf(share.pass), fail = slicesOf(share.fail);
  if (!pass.length && !fail.length) return null;
  const n = (x) => x.reduce((a, s) => a + s.value, 0);
  return (
    <section className="card">
      <h3>{t('Onde você passa e onde você quebra')}</h3>
      <p className="muted small">{t('Cada chart conta no padrão que mais pesa nele. Um padrão com fatia maior nas quebras do que nos passes é um ponto fraco; o contrário, um ponto forte.')}</p>
      <div className="donut-pair">
        <div><h4 className="center">{t('Passes')}</h4><Donut slices={pass} label={t('Passes')} center={[fmtNum(n(pass)), t('passes')]} /></div>
        <div><h4 className="center">{t('Quebras')}</h4>{fail.length ? <Donut slices={fail} label={t('Quebras')} center={[fmtNum(n(fail)), t('quebras')]} /> : <p className="muted small center">{t('Nenhuma quebra registrada perto do seu nível.')}</p>}</div>
      </div>
      <ChartTable head={[t('Padrão'), t('Passes'), t('Quebras')]}
        rows={PATTERNS.filter((p) => share.pass[p] || share.fail[p]).map((p) => [dimName(p), share.pass[p] || 0, share.fail[p] || 0])} />
    </section>
  );
}

// ---------- Pontos fracos ----------
function Weak({ r, mode, hasOther, otherName }) {
  const list = r.weak;
  const maxAbs = Math.max(10, ...list.map((w) => Math.abs(w.index)));
  return (
    <>
      <LevelSummary lvl={r.lvl} mode={mode} />
      <ShareDonuts share={r.share} />
      <section className="card">
        <h3>{t('Pontos fracos e fortes por padrão')}</h3>
        <p className="muted small">
          {t('Comparamos os charts com muito de cada padrão com o resto, perto do seu nível, descontando a dificuldade do nível: quanto você quebra a mais (ou a menos) e quanto perde de nota.')}
          {hasOther && <> {t('Usa também o seu histórico da {v}, porque padrão é habilidade sua, não da versão.', { v: otherName })}</>}
        </p>
        {!list.length && <p className="empty">{t('Ainda não há tentativas suficientes perto do seu nível com estilo conhecido. Continue jogando e sincronizando.')}</p>}
        <div className="weak-list">
          {list.map((w) => {
            const weak = w.index > 0;
            return (
              <div key={w.id} className={`weak-row ${w.confidence}`}>
                <div className="weak-name"><b>{dimName(w.id)}</b>
                  <small className="muted">{w.confidence === 'high' ? t('bastante dado') : w.confidence === 'mid' ? t('dado médio') : t('pouco dado')} · {tn(w.charts, '{n} chart', '{n} charts')}</small>
                </div>
                <div className="weak-bar" title={`${w.index.toFixed(1)}`}>
                  <span className="mid" />
                  <span className={`fill ${weak ? 'weak' : 'strong'}`} style={{ width: `${(Math.abs(w.index) / maxAbs) * 50}%`, [weak ? 'left' : 'right']: '50%' }} />
                </div>
                <div className="weak-txt small">
                  {t('Quebra {f}% (esperado {e}%)', { f: Math.round(w.failRate * 100), e: Math.round(w.expected * 100) })}
                  {w.scoreGap != null && Math.abs(w.scoreGap) >= 3000 && <> · {w.scoreGap < 0
                    ? t('{g} mil pontos abaixo da sua média', { g: Math.round(-w.scoreGap / 1000) })
                    : t('{g} mil pontos acima da sua média', { g: Math.round(w.scoreGap / 1000) })}</>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="weak-legend small muted"><span><i className="weak" /> {t('mais fraco')}</span><span><i className="strong" /> {t('mais forte')}</span></div>
      </section>
      {list[0] && list[0].index > 0 && (
        <section className="card">
          <h3>{t('Como treinar {p}', { p: dimName(list[0].id) })}</h3>
          <p>{t(DIM_TIP[list[0].id])}</p>
          <Link className="link" to="?v=plano">{t('Ver o plano de treino da semana')}</Link>
        </section>
      )}
    </>
  );
}

// ---------- Dicas ----------
function ChartLinks({ charts }) {
  if (!charts?.length) return null;
  return (
    <div className="tip-charts">
      {charts.map((c) => (
        <Link key={c.id} to={`/musica/${c.song.id}`} className="tip-chart">
          <Jacket song={c.song} width={48} />
          <Ball chart={c} size="sm" />
          <span>{c.song.title}</span>
          {c.score != null && <small className="muted">{c.broken ? t('quebrou') : fmtScore(c.score)}</small>}
        </Link>
      ))}
    </div>
  );
}

function tipText(tp) {
  const v = tp.vars;
  switch (tp.kind) {
    case 'wall': return t('Seu muro está no {m}{L}: você passou {p} de {a} charts que tentou. No {m}{L0} você passa {r}%. Fixe o {m}{L} pelos charts mais fáceis do nível antes de subir:', v);
    case 'stuck': return v.patterns.length
      ? t('Você quebrou {n} vezes em {song} ({c}) e ainda não passou. Ele tem muito {p}: treine isso em charts 1 ou 2 níveis abaixo e volte depois:', { n: v.n, song: tp.chart.song.title, c: chartLabel(tp.chart), p: v.patterns.map(dimName).join(' + ') })
      : t('Você quebrou {n} vezes em {song} ({c}) e ainda não passou. Passe charts parecidos um nível abaixo antes de voltar nele.', { n: v.n, song: tp.chart.song.title, c: chartLabel(tp.chart) });
    case 'pattern': return `${t('Seu ponto fraco hoje é {p}: nos charts com muito {p} você quebra {f}% das vezes, quando o esperado pelo nível seria {e}%.', { p: dimName(v.p), f: v.f, e: v.e })}${
      v.gap != null && v.gap <= -3000 ? ` ${t('Quando passa, tira em média {g} mil pontos a menos.', { g: Math.round(-v.gap / 1000) })}` : ''} ${t(DIM_TIP[v.p])} ${t('Para treinar:')}`;
    case 'strength': return t('Seu ponto forte é {p}: você quebra {f}% nesses charts (esperado {e}%). Use isso para subir de nível com charts que têm muito {p}:', { p: dimName(v.p), f: v.f, e: v.e });
    case 'accuracy': return tp.sub === 'miss'
      ? t('Você passa, mas com muitos misses: média de {n} por música nas últimas {k} jogadas perto do seu nível. Antes de subir, tente passar com menos de 10 misses; aumentar o speed ajuda a ler as setas.', v)
      : t('{r}% das suas notas perto do seu nível são great, good ou bad. Trabalhe o timing: jogue charts 2 ou 3 níveis abaixo buscando SS e confira se o speed está confortável.', v);
    case 'trend': return v.up
      ? t('Nas últimas 2 semanas você passou {a}% das tentativas (antes: {b}%). Está evoluindo, mantenha o ritmo.', v)
      : t('Nas últimas 2 semanas você passou {a}% das tentativas (antes: {b}%). Se estiver forçando nível alto demais, intercale com charts do seu nível de conforto.', v);
    case 'data': return t('O PIU Stats tem só {n} jogadas suas registradas. O site da Pump guarda apenas as 50 últimas, então sincronize depois de cada sessão (ou ligue a sincronização automática) para as dicas ficarem mais precisas.', v);
    default: return '';
  }
}

function Tips({ r, mode }) {
  return (
    <>
      <LevelSummary lvl={r.lvl} mode={mode} />
      <p className="muted small">{t('Dicas tiradas das suas tentativas: o que você passou, onde quebrou e com que precisão.')}</p>
      {!r.tipList.length && <p className="empty">{t('Ainda sem dicas para este modo. Jogue e sincronize mais algumas vezes.')}</p>}
      {r.tipList.map((tp) => (
        <section key={tp.id} className={`card tip tip-${tp.kind}`}>
          <p>{tipText(tp)}</p>
          <ChartLinks charts={tp.charts} />
        </section>
      ))}
    </>
  );
}

// ---------- Plano de treino ----------
const KIND = { warm: 'Aquecimento', focus: 'Ponto fraco', consolidate: 'Consolidar', challenge: 'Desafio', score: 'Nota (PUMBILITY)' };
function goalText(g) {
  const v = g.vars;
  if (g.id === 'clear_target') return t('Passar {n} charts {m}{L} novos', v);
  if (g.id === 'clear_prev') return t('Passar {n} charts {m}{L} que ainda faltam', v);
  if (g.id === 'weak') return t('Jogar {n} charts com muito {p}', { n: v.n, p: dimName(v.p) });
  return t('Jogar os {n} charts do plano', v);
}

function Plan({ r }) {
  const p = r.plan;
  if (!p) return <p className="empty">{t('Passe alguns charts neste modo para montar o plano.')}</p>;
  const end = p.weekStart + 6 * 86400000;
  return (
    <>
      <section className="card">
        <h3>{t('Semana de {a} a {b}', { a: fmtWeek(p.weekStart), b: fmtWeek(end) })}</h3>
        <p className="muted small">
          {t('Alvo: {c}. Nível de conforto: {k}.', { c: chartLabel({ mode: p.mode, level: p.lvl.target }), k: chartLabel({ mode: p.mode, level: p.lvl.comfort }) })}
          {p.weakP && <> {t('Foco da semana: {p}.', { p: dimName(p.weakP) })}</>}
          {' '}{t('O plano muda toda segunda e marca sozinho o que você jogou.')}
        </p>
        <div className="goals">
          {p.goals.map((g) => (
            <div key={g.id} className={`goal ${g.cur >= g.goal ? 'done' : ''}`}>
              <div className="goal-h"><span>{g.cur >= g.goal ? <Check size={14} /> : <Target size={14} />} {goalText(g)}</span><b>{Math.min(g.cur, g.goal)}/{g.goal}</b></div>
              <div className="goal-bar"><span style={{ width: `${Math.min(100, (g.cur / g.goal) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
      {p.sessions.map((s, i) => (
        <section key={i} className="card session">
          <h3>{t('Sessão {n}', { n: i + 1 })}</h3>
          {s.map((it) => (
            <div key={it.chart.id} className={`plan-row ${p.played.has(it.chart.id) ? 'done' : ''}`}>
              <Link to={`/musica/${it.chart.song.id}?c=${it.chart.id}`} className={`plan-item ${p.played.has(it.chart.id) ? 'done' : ''}`}>
                <span className={`kind k-${it.kind}`}>{t(KIND[it.kind])}</span>
                <Ball chart={it.chart} size="sm" />
                <span className="ttl">{it.chart.song.title}</span>
                {p.played.has(it.chart.id) ? <Check size={16} className="ok" /> : it.chart.score != null && !it.chart.broken ? <small className="muted">{fmtScore(it.chart.score)}</small> : null}
              </Link>
              <TrainingAddChip chart={it.chart} />
            </div>
          ))}
        </section>
      ))}
      <p className="muted tiny center">{t('Aquecimento: charts que você já passa. Ponto fraco: charts com muito do padrão em que você mais quebra. Consolidar e Desafio: os mais fáceis dos próximos níveis que você ainda não passou. Nota: onde dá para subir PUMBILITY.')}</p>
    </>
  );
}

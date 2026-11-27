import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import PlanLock from '../components/PlanLock.jsx';
import { loadProgress } from '../lib/api.js';
import { entitlements, isOn } from '../lib/plans.js';
import { analyzeTraining, chanceLabel, setTraining, useTraining } from '../lib/training.js';
import { fmtScore } from '../lib/piu.js';
import { locale, t, tErr, tn } from '../lib/i18n.js';
import { Ball, Grade, Jacket } from '../components/ui.jsx';
import { Chips } from './Songs.jsx';
import { DIM_LABEL, DIM_TIP } from './Progress.jsx';
import { Check, Dumbbell, Lock, Crown, Target, Trash2, Trophy } from '../components/Icons.jsx';

const dimName = (p) => t(DIM_LABEL[p] || p);

function reasonText(r) {
  const v = r.vars || {};
  switch (r.id) {
    case 'level': return t('Você passa {r}% dos {m}{L} que já jogou', v);
    case 'above': return t('Acima do seu maior nível passado ({m}{L})', v);
    case 'near': return t('Perto do seu nível ({m}{L})', v);
    case 'easy': return t('Fácil para o nível (tier)');
    case 'hard': return t('Difícil para o nível (tier)');
    case 'weak': return t('Tem muito {p}, seu ponto fraco', { p: dimName(v.p) });
    case 'strong': return t('Tem muito {p}, seu ponto forte', { p: dimName(v.p) });
    case 'gimmick': return t('Tem gimmick');
    case 'fails': return tn(v.n, 'Quebrou {n} vez', 'Quebrou {n} vezes');
    default: return '';
  }
}

/** Tentativas no chart: passes e quebras em ordem, com a nota de cada uma, para ver a evolução. */
export function Attempts({ x }) {
  const [open, setOpen] = useState(false);
  const h = x.history;
  if (!h.length) return <p className="muted small ti-attempts-empty">{t('Nenhuma tentativa registrada ainda. Jogue e sincronize para acompanhar a evolução.')}</p>;
  const passes = h.filter((a) => !a.broken).length;
  const firstIdx = h.findIndex((a) => !a.broken);
  const recent = h.slice(-16);
  const scores = h.map((a) => a.score || 0);
  const max = Math.max(...scores, 1), min = Math.min(...scores);
  const W = 120, H = 28;
  const pts = h.length > 1 ? h.map((a, i) => `${(i / (h.length - 1)) * W},${H - 2 - (((a.score || 0) - min) / Math.max(1, max - min)) * (H - 4)}`).join(' ') : null;
  const fmt = (ts) => new Date(ts).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
  return (
    <div className="ti-attempts">
      <div className="ti-att-head">
        <span className="small">
          {tn(h.length, '{n} tentativa', '{n} tentativas')} · <b className="bad">{tn(h.length - passes, '{n} quebra', '{n} quebras')}</b> · <b className="good">{tn(passes, '{n} passe', '{n} passes')}</b>
        </span>
        {pts && <svg className="ti-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><polyline points={pts} fill="none" strokeWidth="2" /></svg>}
      </div>
      <div className="ti-dots" aria-label={t('Últimas tentativas: verde passou, vermelho quebrou')}>
        {recent.map((a, i) => <span key={i} className={a.broken ? 'bad' : 'good'} title={`${fmt(a.at)} · ${fmtScore(a.score)}${a.broken ? ` · ${t('quebrou')}` : ''}`} />)}
      </div>
      {firstIdx >= 0 && (
        <p className="small muted">
          {t('Passou pela primeira vez em {d}, na tentativa {k}.', { d: fmt(h[firstIdx].at), k: firstIdx + 1 })}
          {x.clearedInTraining && <b className="good"> {t('Depois de entrar no treino!')}</b>}
        </p>
      )}
      {x.triesSince > 0 && !x.cleared && <p className="small muted">{t('Desde que entrou no treino: {n} tentativas, {f} quebras.', { n: x.triesSince, f: x.failsSince })}</p>}
      <button type="button" className="link small" onClick={() => setOpen((o) => !o)}>{open ? t('Esconder tentativas') : t('Ver todas as tentativas')}</button>
      {open && (
        <ol className="ti-att-list">
          {[...h].reverse().map((a, i) => (
            <li key={i} className={a.broken ? 'bad' : 'good'}>
              <span className="muted">{fmt(a.at)}</span>
              <span className="sc">{fmtScore(a.score)}</span>
              <Grade grade={a.grade} broken={a.broken} size="sm" />
              {a.miss != null && <span className="muted">{t('{n} miss', { n: a.miss })}</span>}
              {a.at < x.added && <span className="muted tiny">{t('antes do treino')}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Meu treino: os charts que a pessoa escolheu, com a chance de passar e o que treinar antes. */
export default function Training() {
  const { data, version, plan } = useData();
  const ent = entitlements(plan);
  const list = useTraining();
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState('chance');
  const [busy, setBusy] = useState(0);

  useEffect(() => {
    let alive = true;
    loadProgress(version).then((r) => alive && setRaw(r)).catch((e) => alive && setErr(tErr(e.message)));
    return () => { alive = false; };
  }, [version]);

  const items = useMemo(() => (raw && list ? analyzeTraining(raw, data, list, version) : null), [raw, list, data, version]);
  const sorted = useMemo(() => {
    if (!items) return [];
    const arr = [...items];
    if (sort === 'chance') arr.sort((a, b) => (a.cleared - b.cleared) || b.chance - a.chance || a.chart.level - b.chart.level);
    if (sort === 'level') arr.sort((a, b) => a.chart.level - b.chart.level || b.chance - a.chance);
    if (sort === 'added') arr.sort((a, b) => b.added - a.added);
    if (sort === 'tries') arr.sort((a, b) => b.history.length - a.history.length || b.chance - a.chance);
    return arr;
  }, [items, sort]);

  if (!isOn(plan, 'training')) return <div className="page"><p className="empty">{t('Este recurso está desligado no momento.')}</p></div>;
  if (!ent.can('training_list')) return <div className="page training"><h2 className="ic-row"><Dumbbell size={20} /> {t('Meu treino')}</h2><PlanLock feature="training_list" title={t('Meu treino')} compact /></div>;
  const canAnalyze = ent.can('training_analysis');
  const open = (items || []).filter((x) => !x.cleared);
  const best = [...open].sort((a, b) => b.chance - a.chance)[0];
  const hardest = [...open].sort((a, b) => a.chance - b.chance)[0];
  const focusCount = {};
  for (const x of open) if (x.focus) focusCount[x.focus] = (focusCount[x.focus] || 0) + 1;
  const wins = (items || []).filter((x) => x.clearedInTraining).sort((a, b) => b.clearedAt - a.clearedAt);
  const focus = Object.entries(focusCount).sort((a, b) => b[1] - a[1])[0];
  const remove = async (id) => { setBusy(id); try { await setTraining(id, false); } catch (e) { setErr(tErr(e.message)); } finally { setBusy(0); } };

  return (
    <div className="page training">
      <h2 className="ic-row"><Dumbbell size={20} /> {t('Meu treino')}</h2>
      <p className="muted small">{t('Marque as músicas que quer passar com o botão "Treinar" na página de cada música. Aqui você vê a chance de passar cada uma e o que treinar antes.')}</p>
      {err && <div className="form-err">{err}</div>}
      {(!list || (!items && !err)) && <p className="empty">{t('Carregando…')}</p>}

      {items && !items.length && (
        <section className="card empty-train">
          <p>{t('Seu treino está vazio.')}</p>
          <div className="bm-row">
            <Link className="btn" to="/tier"><Target size={15} /> {t('Escolher pelo Tier')}</Link>
            <Link className="btn ghost" to="/recomendacoes">{t('Ver recomendadas')}</Link>
          </div>
        </section>
      )}

      {items && items.length > 0 && (
        <>
          {canAnalyze && open.length > 0 && (
            <section className="train-summary">
              {best && <div className="ts-box good"><small>{t('Mais perto de passar')}</small><Link to={`/chart/${best.chart.id}`}>{best.chart.song.title} <Ball chart={best.chart} size="sm" /></Link><b>{best.chance}%</b></div>}
              {hardest && hardest !== best && <div className="ts-box bad"><small>{t('Mais longe')}</small><Link to={`/chart/${hardest.chart.id}`}>{hardest.chart.song.title} <Ball chart={hardest.chart} size="sm" /></Link><b>{hardest.chance}%</b></div>}
              {focus && <div className="ts-box"><small>{t('Foco de treino')}</small><span>{dimName(focus[0])}</span><b>{tn(focus[1], 'em {n} música', 'em {n} músicas')}</b></div>}
            </section>
          )}
          {wins.length > 0 && (
            <section className="card train-wins">
              <h3 className="ic-row"><Trophy size={18} /> {tn(wins.length, 'Você passou {n} música do treino', 'Você passou {n} músicas do treino')}</h3>
              <div className="ti-train-list">
                {wins.map((x) => (
                  <Link key={x.chart.id} to={`/chart/${x.chart.id}`} className="ti-train-chip win">
                    <Ball chart={x.chart} size="sm" /> {x.chart.song.title}
                    <small className="muted">{new Date(x.clearedAt).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })} · {tn(x.history.findIndex((a) => !a.broken) + 1, '{n}ª tentativa', '{n}ª tentativa')}</small>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {canAnalyze && focus && DIM_TIP[focus[0]] && <p className="muted small train-tip">{t(DIM_TIP[focus[0]])}</p>}

          <div className="filters">
            <Chips value={sort} onChange={setSort} options={[['chance', t('Chance')], ['level', t('Nível')], ['tries', t('Tentativas')], ['added', t('Recentes')]]} />
            <span className="muted small">{tn(items.length, '{n} música', '{n} músicas')}</span>
          </div>

          <ol className="train-list">
            {sorted.map((x) => (
              <li key={x.chart.id} className={`train-item ${x.cleared ? 'cleared' : ''}`}>
                <div className="ti-head">
                  <Link to={`/chart/${x.chart.id}`} className="ti-song">
                    <Jacket song={x.chart.song} width={52} />
                    <div>
                      <div className="ti-title">{x.chart.song.title}</div>
                      <div className="ti-sub"><Ball chart={x.chart} size="sm" />
                        {x.chart.score != null && <><Grade grade={x.chart.grade} broken={x.chart.broken} size="sm" /> <span className="small">{fmtScore(x.chart.score)}</span></>}
                      </div>
                    </div>
                  </Link>
                  <button className="btn ghost icon" disabled={busy === x.chart.id} onClick={() => remove(x.chart.id)} title={t('Tirar do Meu treino')} aria-label={t('Tirar do Meu treino')}><Trash2 size={15} /></button>
                </div>

                <Attempts x={x} />
                {x.cleared ? (
                  <p className="small ti-done"><Check size={14} /> {t('Já passou!')}
                    {x.next && <> {t('Faltam {n} pontos para {g}.', { n: fmtScore(x.next.need), g: x.next.grade })}</>}
                  </p>
                ) : canAnalyze ? (
                  <>
                    <div className={`chance ${x.chance >= 65 ? 'good' : x.chance >= 35 ? 'mid' : 'bad'}`}>
                      <div className="chance-bar"><span style={{ width: `${x.chance}%` }} /></div>
                      <b>{x.chance}%</b><small>{t(chanceLabel(x.chance))}</small>
                    </div>
                    {x.reasons.length > 0 && (
                      <ul className="ti-reasons">
                        {x.reasons.map((r, i) => <li key={i} className={r.tone}>{reasonText(r)}</li>)}
                      </ul>
                    )}
                    {x.train.length > 0 && (
                      <div className="ti-train">
                        <small className="muted">{x.focus ? t('Para treinar {p} antes:', { p: dimName(x.focus) }) : t('Para chegar lá, passe antes:')}</small>
                        <div className="ti-train-list">
                          {x.train.map((c) => (
                            <Link key={c.id} to={`/chart/${c.id}`} className="ti-train-chip"><Ball chart={c} size="sm" /> {c.song.title}</Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="small muted ic-row"><Lock size={14} /> {t('A chance de passar e o que treinar fazem parte dos planos pagos.')} <Link to="/planos"><Crown size={13} /> {t('Ver planos')}</Link></p>
                )}
              </li>
            ))}
          </ol>
          <p className="muted tiny">{t('A chance é uma estimativa: junta quanto você passa nesse nível, o tier do chart, os padrões dele comparados com seus pontos fortes e fracos e as vezes que você já quebrou nele.')}</p>
        </>
      )}
    </div>
  );
}

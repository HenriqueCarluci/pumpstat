import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { loadProgress } from '../lib/api.js';
import { entitlements, isOn } from '../lib/plans.js';
import { analyzeTraining, chanceLabel, setTraining, useTraining } from '../lib/training.js';
import { fmtScore } from '../lib/piu.js';
import { t, tErr, tn } from '../lib/i18n.js';
import { Ball, Grade, Jacket } from '../components/ui.jsx';
import { Chips } from './Songs.jsx';
import { DIM_LABEL, DIM_TIP } from './Progress.jsx';
import { Check, Dumbbell, Lock, Crown, Target, Trash2 } from '../components/Icons.jsx';

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
    return arr;
  }, [items, sort]);

  if (!isOn(plan, 'training')) return <div className="page"><p className="empty">{t('Este recurso está desligado no momento.')}</p></div>;
  const canAnalyze = ent.can('training_analysis');
  const open = (items || []).filter((x) => !x.cleared);
  const best = [...open].sort((a, b) => b.chance - a.chance)[0];
  const hardest = [...open].sort((a, b) => a.chance - b.chance)[0];
  const focusCount = {};
  for (const x of open) if (x.focus) focusCount[x.focus] = (focusCount[x.focus] || 0) + 1;
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
              {best && <div className="ts-box good"><small>{t('Mais perto de passar')}</small><Link to={`/musica/${best.chart.song.id}?c=${best.chart.id}`}>{best.chart.song.title} <Ball chart={best.chart} size="sm" /></Link><b>{best.chance}%</b></div>}
              {hardest && hardest !== best && <div className="ts-box bad"><small>{t('Mais longe')}</small><Link to={`/musica/${hardest.chart.song.id}?c=${hardest.chart.id}`}>{hardest.chart.song.title} <Ball chart={hardest.chart} size="sm" /></Link><b>{hardest.chance}%</b></div>}
              {focus && <div className="ts-box"><small>{t('Foco de treino')}</small><span>{dimName(focus[0])}</span><b>{tn(focus[1], 'em {n} música', 'em {n} músicas')}</b></div>}
            </section>
          )}
          {canAnalyze && focus && DIM_TIP[focus[0]] && <p className="muted small train-tip">{t(DIM_TIP[focus[0]])}</p>}

          <div className="filters">
            <Chips value={sort} onChange={setSort} options={[['chance', t('Chance')], ['level', t('Nível')], ['added', t('Recentes')]]} />
            <span className="muted small">{tn(items.length, '{n} música', '{n} músicas')}</span>
          </div>

          <ol className="train-list">
            {sorted.map((x) => (
              <li key={x.chart.id} className={`train-item ${x.cleared ? 'cleared' : ''}`}>
                <div className="ti-head">
                  <Link to={`/musica/${x.chart.song.id}?c=${x.chart.id}`} className="ti-song">
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
                            <Link key={c.id} to={`/musica/${c.song.id}?c=${c.id}`} className="ti-train-chip"><Ball chart={c} size="sm" /> {c.song.title}</Link>
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

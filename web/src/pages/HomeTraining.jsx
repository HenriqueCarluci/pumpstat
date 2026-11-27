// Treino em casa: importa o Stats.xml do StepP1 / XSanity e lista os recordes de casa (separados do fliperama).
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { isOn } from '../lib/plans.js';
import { parseStats, SOURCES } from '../lib/homeScores.js';
import { fmtNum, t, tErr, tn } from '../lib/i18n.js';
import { fmtScore } from '../lib/piu.js';
import { Ball, Grade, Jacket } from '../components/ui.jsx';
import { Chips } from './Songs.jsx';
import { Check, ChevronRight, Upload } from '../components/Icons.jsx';

export default function HomeTraining() {
  const { data, plan, home, reloadHome } = useData();
  const [source, setSource] = useState('stepp1');
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [showMiss, setShowMiss] = useState(false);
  const file = useRef(null);

  const mine = useMemo(() => data.charts.filter((c) => c.home)
    .sort((a, b) => b.level - a.level || (b.home.score || 0) - (a.home.score || 0)), [data]);

  if (!isOn(plan, 'home_import')) return <div className="page"><p className="empty">{t('Este recurso está desligado no momento.')}</p></div>;
  if (!home?.settings?.on) {
    return (
      <div className="page">
        <h2>{t('Treino em casa')}</h2>
        <p className="muted">{t('Ative o treino em casa em Ajustes para importar seus recordes do StepP1 ou do XSanity.')}</p>
        <Link to="/ajustes" className="btn">{t('Ir para Ajustes')}</Link>
      </div>
    );
  }

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(''); setMsg(''); setParsed(null);
    if (f.size > 25 * 1024 * 1024) { setErr(t('Arquivo grande demais.')); return; }
    try { setParsed(parseStats(await f.text(), data)); } catch (x) { setErr(tErr(x.message)); }
  };
  const save = async () => {
    if (!parsed?.rows.length) return;
    setBusy(true); setErr('');
    try {
      const rows = parsed.rows.map((r) => ({ chart: r.chart, score: r.score, grade: r.grade, broken: r.broken, plays: r.plays, last_played: r.last_played, perfect: r.perfect, great: r.great, good: r.good, bad: r.bad, miss: r.miss }));
      const r = await rpc('save_home_scores', { p_source: source, p_rows: rows });
      setMsg(tn(r.saved, '{n} recorde salvo', '{n} recordes salvos'));
      setParsed(null);
      await reloadHome();
    } catch (x) { setErr(tErr(x.message)); }
    setBusy(false);
  };
  const clear = async () => {
    if (!window.confirm(t('Apagar todos os recordes de casa? Os do fliperama não são afetados.'))) return;
    await rpc('clear_home_scores', { p_source: null }).catch(() => {});
    await reloadHome();
  };

  return (
    <div className="page home-training">
      <h2>{t('Treino em casa')}</h2>
      <p className="muted small">{home.settings.mode === 'merged'
        ? t('Consolidado: quando o recorde de casa é melhor, ele aparece no lugar do da Phoenix 2 nas suas telas, marcado como treino em casa.')
        : t('Separado: os recordes de casa aparecem à parte e não mudam as suas métricas da Phoenix 2.')}{' '}
        <Link to="/ajustes" className="link">{t('Mudar em Ajustes')}</Link></p>

      <section className="card">
        <h3>{t('Importar recordes')}</h3>
        <p className="muted small">{t('Envie o arquivo Stats.xml do seu perfil. Ele fica na pasta do simulador, em Save/LocalProfiles/<número>/Stats.xml, ou no pendrive do perfil.')}</p>
        <Chips value={source} onChange={setSource} options={[['stepp1', 'StepP1'], ['xsanity', 'XSanity'], ['stepf2', 'StepF2'], ['other', t('Outro')]]} />
        <input ref={file} type="file" accept=".xml,text/xml,application/xml" hidden onChange={pick} />
        <button type="button" className="btn" onClick={() => file.current?.click()}><Upload size={16} /> {t('Escolher Stats.xml')}</button>
        {err && <div className="form-err">{err}</div>}
        {msg && <p className="ic-row small up"><Check size={14} /> {msg}</p>}
        {parsed && (
          <div className="ht-preview">
            <p>{parsed.profile && <b>{parsed.profile} · </b>}{t('{a} charts reconhecidos, {b} sem correspondência no catálogo da Phoenix 2.', { a: parsed.rows.length, b: parsed.unmatched.length })}</p>
            <div className="ht-list">
              {parsed.rows.slice(0, 8).map((r) => (
                <div key={r.chart} className="pp-top-row style-row no-link">
                  <Jacket song={r._chart.song} width={48} /><Ball chart={r._chart} size="sm" />
                  <span className="pp-top-name">{r._chart.song.title}<small className="muted">{r.broken ? t('quebrou') : fmtScore(r.score)}</small></span>
                  <Grade grade={r.grade} broken={r.broken} size="xs" /><span />
                </div>
              ))}
              {parsed.rows.length > 8 && <p className="muted small">{t('e mais {n}…', { n: parsed.rows.length - 8 })}</p>}
            </div>
            {parsed.unmatched.length > 0 && (
              <>
                <button type="button" className="link small" onClick={() => setShowMiss(!showMiss)}>{showMiss ? t('Esconder os não reconhecidos') : t('Ver os não reconhecidos')}</button>
                {showMiss && <ul className="ht-miss small muted">{parsed.unmatched.slice(0, 60).map((u, i) => <li key={i}>{u.title || '?'} {u.mode || ''}{u.level || ''} · {u.reason === 'song' ? t('música não encontrada') : t('nível não encontrado')}</li>)}</ul>}
              </>
            )}
            <div className="bm-row">
              <button type="button" className="btn" disabled={busy || !parsed.rows.length} onClick={save}>{t('Salvar como {s}', { s: SOURCES[source] })}</button>
              <button type="button" className="btn ghost" onClick={() => setParsed(null)}>{t('Cancelar')}</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="row-between"><h3>{t('Seus recordes de casa')} <span className="muted">({mine.length})</span></h3>
          {mine.length > 0 && <button type="button" className="link small" onClick={clear}>{t('Apagar tudo')}</button>}</div>
        {!mine.length && <p className="muted small">{t('Nada importado ainda.')}</p>}
        <div className="style-list">
          {mine.slice(0, 200).map((c) => (
            <Link key={c.id} to={`/chart/${c.id}`} className="pp-top-row style-row">
              <Jacket song={c.song} width={48} /><Ball chart={c} size="sm" />
              <span className="pp-top-name">{c.song.title}<small className="muted">{SOURCES[c.home.source]} · {c.home.broken ? t('quebrou') : fmtScore(c.home.score)}{c.home.plays ? ` · ${tn(c.home.plays, '{n} jogada', '{n} jogadas')}` : ''}</small></span>
              <Grade grade={c.home.grade} broken={c.home.broken} size="xs" />
              <ChevronRight size={16} className="muted" />
            </Link>
          ))}
        </div>
        {mine.length > 0 && <p className="muted tiny">{t('Fliperama: {n} destes charts você já passou na Phoenix 2.', { n: fmtNum(mine.filter((c) => (c.arcade ? !c.arcade.broken && c.arcade.score != null : !c.broken && c.score != null)).length) })}</p>}
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { buildDay, highlights, loadDayReport } from '../lib/dayReport.js';
import { Chips } from './Songs.jsx';
import { dayLabelOf, downloadImage, drawDayImage, shareImage } from '../lib/dayImage.js';
import { fmtNum, locale, t, tErr, tMsg, tn } from '../lib/i18n.js';
import { isOn } from '../lib/plans.js';
import { VERSIONS } from '../lib/piu.js';
import { isNative } from '../lib/native.js';
import { Ball, Grade, Jacket, Plate } from '../components/ui.jsx';
import { useSyncJob } from '../components/PiuConnect.jsx';
import { TrainingAddChip } from '../components/TrainingToggle.jsx';
import { CalendarCheck, ChevronLeft, ChevronRight, Flame, RefreshCw, Send, Sparkles, Target, TrendingUp, X } from '../components/Icons.jsx';

const hhmm = (s) => new Date(s * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

function Delta({ now, before, digits = 0, suffix = '' }) {
  if (before == null || now == null) return null;
  const d = Number(now) - Number(before);
  if (Math.abs(d) < (digits ? 0.05 : 1)) return <span className="dr-delta eq">=</span>;
  return <span className={`dr-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {fmtNum(Math.abs(d), { maximumFractionDigits: digits })}{suffix}</span>;
}

function Kpi({ label, value, sub, delta, hi }) {
  return (
    <div className={`dr-kpi ${hi ? 'hi' : ''}`}>
      <small>{label}</small>
      <b>{value}</b>
      {(sub || delta) && <span className="dr-kpi-sub">{sub}{delta}</span>}
    </div>
  );
}

function Row({ r, right, sub, train }) {
  return (
    <div className="dr-row">
      <Ball chart={r.chart} size="sm" />
      <div className="dr-row-info">
        <Link to={`/musica/${r.chart.song.id}`}><b>{r.chart.song.title}</b></Link>
        {sub && <small className="muted">{sub}</small>}
      </div>
      <div className="dr-row-right">{right}</div>
      {train && <TrainingAddChip chart={r.chart} />}
    </div>
  );
}

const JUDG = [['perfect', 'PERFECT', 'j1'], ['great', 'GREAT', 'j2'], ['good', 'GOOD', 'j3'], ['bad', 'BAD', 'j4'], ['miss', 'MISS', 'j5']];
/** PERFECT / GREAT / GOOD / BAD / MISS: barra proporcional e os números. */
function Judgments({ p }) {
  if (!p || p.perfect == null) return null;
  const tot = JUDG.reduce((a, [k]) => a + (p[k] || 0), 0) || 1;
  return (
    <div className="dr-judg">
      <div className="dr-judg-bar">{JUDG.map(([k, , c]) => <i key={k} className={c} style={{ width: `${((p[k] || 0) / tot) * 100}%` }} />)}</div>
      <div className="dr-judg-n">{JUDG.map(([k, l, c]) => <span key={k} className={c}><small>{l}</small>{fmtNum(p[k] || 0)}</span>)}</div>
    </div>
  );
}

/** Destaque do dia: capa grande, nível, score, grade/plate e os julgamentos da melhor jogada. */
function Highlight({ r }) {
  const tag = r.kind === 'clear' ? t('Primeiro passe') : r.kind === 'pb' ? `+${fmtNum(r.delta)}${r.gradeUp ? ` · ${r.prevGrade} → ${r.grade}` : ''}` : (r.tries > 1 ? t('{n} tentativas', { n: r.tries }) : t('Passou'));
  return (
    <Link className="dr-hl" to={`/musica/${r.chart.song.id}`}>
      <div className="dr-hl-jk"><Jacket song={r.chart.song} width={132} /><span className="dr-hl-ball"><Ball chart={r.chart} size="sm" /></span></div>
      <div className="dr-hl-info">
        <b>{r.chart.song.title}</b>
        <span className={`dr-hl-tag ${r.kind}`}>{tag}</span>
        <div className="dr-hl-score"><span>{fmtNum(r.score)}</span><Grade grade={r.grade} size="sm" />{r.plate && <Plate plate={r.plate} size="sm" />}</div>
        <Judgments p={r.best} />
      </div>
    </Link>
  );
}

/** Imagem pronta: prévia e botões de compartilhar/baixar. */
function ImageSheet({ blob, filename, text, onClose, format, onFormat, busy }) {
  const [url, setUrl] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  const share = async () => {
    setMsg('');
    try {
      const r = await shareImage(blob, filename, text);
      if (r === 'downloaded') setMsg(t('Imagem baixada.'));
    } catch (e) { setMsg(tErr(e.message || 'Não deu para compartilhar.')); }
  };
  return (
    <div className="qs-backdrop" onClick={onClose} role="presentation">
      <div className="qs-sheet dr-sheet" role="dialog" aria-modal="true" aria-label={t('Imagem do dia')} onClick={(e) => e.stopPropagation()}>
        <div className="qs-grip" aria-hidden="true" />
        <Chips value={format} onChange={onFormat} options={[['feed', t('Feed (4:5)')], ['story', t('Stories (9:16)')]]} />
        {url && <img className={`dr-preview ${busy ? 'busy' : ''}`} src={url} alt={t('Imagem do dia')} />}
        <div className="qs-row">
          <button type="button" className="btn" onClick={share}><Send size={15} /> {t('Compartilhar')}</button>
          {isNative
            ? <button type="button" className="btn ghost" onClick={onClose}><X size={15} /> {t('Fechar')}</button>
            : <button type="button" className="btn ghost" onClick={() => { downloadImage(blob, filename); setMsg(t('Imagem baixada.')); }}>{t('Baixar')}</button>}
        </div>
        {msg && <p className="small center qs-msg">{msg}</p>}
      </div>
    </div>
  );
}

/** Relatório do dia de jogo: tudo o que foi jogado no dia, o que melhorou e a imagem para postar. */
export default function DayReport() {
  const { day: dayParam } = useParams();
  const nav = useNavigate();
  const { data, version, plan, reload } = useData();
  const [raw, setRaw] = useState(undefined);
  const [err, setErr] = useState('');
  const [stamp, setStamp] = useState(0);
  const [img, setImg] = useState(null);
  const [making, setMaking] = useState(false);
  const [format, setFormat] = useState('feed');
  const { job, err: syncErr, needLogin, start, running } = useSyncJob(() => { reload(); setStamp((s) => s + 1); });

  useEffect(() => {
    let alive = true;
    setErr('');
    loadDayReport(version, dayParam).then((r) => alive && setRaw(r)).catch((e) => alive && setErr(tErr(e.message)));
    return () => { alive = false; };
  }, [version, dayParam, stamp]);

  const rep = useMemo(() => (raw ? buildDay(raw, data.byId) : null), [raw, data.byId]);

  if (!isOn(plan, 'day_report')) return <div className="page"><p className="empty">{t('Este recurso está desligado no momento.')}</p></div>;

  const days = raw?.days || [];
  const idx = rep ? days.findIndex(([d]) => d === rep.day) : -1;
  const goto = (d) => nav(`/dia/${d}`);
  const syncBtn = (
    <button className="btn ghost" disabled={running} onClick={() => start({ useSaved: true, partial: true, versions: [version] })}>
      <RefreshCw size={15} className={running ? 'spin' : ''} /> {running ? t('Atualizando…') : t('Sincronizar o dia')}
    </button>
  );

  const head = (
    <>
      <div className="row-between dr-top">
        <h2 className="ic-row"><CalendarCheck size={20} /> {t('Meu dia de jogo')}</h2>
        {syncBtn}
      </div>
      {running && <small className="muted">{tMsg(job?.message)}</small>}
      {syncErr && <div className="form-err">{syncErr}</div>}
      {needLogin && <p className="small">{t('Para atualizar, conecte sua conta da Pump uma vez em')} <Link to="/ajustes">{t('Ajustes')}</Link>.</p>}
    </>
  );

  if (err) return <div className="page">{head}<p className="empty">{err}</p></div>;
  if (raw === undefined) return <div className="page">{head}<p className="empty">{t('Carregando…')}</p></div>;
  if (!rep) return <div className="page">{head}<p className="empty">{t('Nenhuma jogada registrada ainda. Sincronize depois de jogar para ver o relatório do dia.')}</p></div>;

  const tt = rep.totals;
  const pv = rep.prev;
  const pvRate = pv && pv.plays ? (pv.passes / pv.plays) * 100 : null;
  const span = tt.first && tt.last ? Math.round((tt.last - tt.first) / 60) : null;
  const longLabel = dayLabelOf(rep.day, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const makeImage = async (fmt = format) => {
    setMaking(true); setFormat(fmt);
    try {
      const blob = await drawDayImage({
        rep, nickname: data.profile?.nickname, versionName: VERSIONS[version]?.name || version, format: fmt,
        dayLabel: dayLabelOf(rep.day, { day: '2-digit', month: 'short', year: 'numeric' }), list: highlights(rep, 7),
      });
      setImg(blob);
    } catch (e) { setErr(tErr(e.message)); }
    setMaking(false);
  };

  return (
    <div className="page day-report">
      {head}

      <div className="dr-nav">
        <button type="button" className="btn ghost icon" disabled={idx < 0 || idx >= days.length - 1} onClick={() => goto(days[idx + 1][0])} aria-label={t('Dia anterior')}><ChevronLeft size={18} /></button>
        <div className="dr-nav-label">
          <b>{longLabel}</b>
          <small className="muted">{tt.first ? `${hhmm(tt.first)} – ${hhmm(tt.last)}` : ''}{span ? ` · ${tn(span, '{n} min', '{n} min')}` : ''}</small>
        </div>
        <button type="button" className="btn ghost icon" disabled={idx <= 0} onClick={() => goto(days[idx - 1][0])} aria-label={t('Próximo dia')}><ChevronRight size={18} /></button>
      </div>

      <section className="dr-kpis">
        <Kpi label={t('Jogadas')} value={fmtNum(tt.plays)} delta={<Delta now={tt.plays} before={pv?.plays} />} />
        <Kpi label={t('Passes')} value={fmtNum(tt.passes)} sub={`${Math.round(tt.rate * 100)}% `} delta={<Delta now={tt.rate * 100} before={pvRate} suffix=" pp" />} />
        <Kpi label={t('Quebras')} value={fmtNum(tt.fails)} />
        <Kpi label={t('Primeiros passes')} value={fmtNum(tt.newClears)} hi={tt.newClears > 0} />
        <Kpi label={t('Recordes')} value={fmtNum(tt.pbs)} hi={tt.pbs > 0} />
        <Kpi label={t('Músicas')} value={fmtNum(tt.charts)} />
        <Kpi label={t('Maior Double')} value={tt.maxD ? `D${tt.maxD}` : '—'} delta={<Delta now={tt.maxD} before={pv?.max_d} />} />
        <Kpi label={t('Maior Single')} value={tt.maxS ? `S${tt.maxS}` : '—'} delta={<Delta now={tt.maxS} before={pv?.max_s} />} />
        <Kpi label={t('Nível médio')} value={tt.avgLevel != null ? tt.avgLevel.toFixed(1) : '—'} delta={<Delta now={tt.avgLevel} before={pv?.avg_level} digits={1} />} />
        {tt.accuracy != null && <Kpi label={t('Acerto')} value={`${(tt.accuracy * 100).toFixed(1)}%`} sub={tn(tt.misses, '{n} miss', '{n} misses')} />}
      </section>
      {pv && <p className="muted tiny dr-vs">{t('Setas: comparação com o dia de jogo anterior ({day}).', { day: dayLabelOf(pv.day) })}</p>}

      {(() => { const hl = highlights(rep, 3); return hl.length > 0 && (
        <section className="card dr-hls">
          <h3 className="ic-row"><Sparkles size={18} /> {hl.some((r) => r.kind !== 'pass') ? t('Destaques do dia') : t('Melhores passes do dia')}</h3>
          {hl.map((r) => <Highlight key={r.chart.id} r={r} />)}
        </section>
      ); })()}

      <button className="btn wide dr-share" disabled={making} onClick={() => makeImage()}>
        <Sparkles size={16} /> {making ? t('Gerando…') : t('Gerar imagem para postar')}
      </button>

      {rep.newClears.length > 0 && (
        <section className="card">
          <h3 className="ic-row"><Flame size={18} /> {t('Primeiros passes')}</h3>
          {rep.newClears.map((r) => (
            <Row key={r.chart.id} r={r} sub={r.triesBefore ? t('Passou depois de {n} tentativas antes de hoje', { n: r.triesBefore }) : tn(r.tries, '{n} tentativa hoje', '{n} tentativas hoje')}
              right={<><Grade grade={r.grade} size="sm" /><span className="dr-score">{fmtNum(r.score)}</span></>} />
          ))}
        </section>
      )}

      {rep.pbs.length > 0 && (
        <section className="card">
          <h3 className="ic-row"><TrendingUp size={18} /> {t('Recordes batidos')}</h3>
          {rep.pbs.map((r) => (
            <Row key={r.chart.id} r={r}
              sub={[t('antes {s}', { s: fmtNum(r.prevScore) }), r.gradeUp && `${r.prevGrade} → ${r.grade}`, r.plateUp && `${r.prevPlate || '—'} → ${r.plate}`].filter(Boolean).join(' · ')}
              right={<div className="dr-pb"><span className="dr-score">{fmtNum(r.score)}</span><span className="dr-delta up">+{fmtNum(r.delta)}</span></div>} />
          ))}
        </section>
      )}

      {rep.stuck.length > 0 && (
        <section className="card">
          <h3 className="ic-row"><Target size={18} /> {t('Ainda não passou')}</h3>
          <p className="muted small">{t('Charts que você tentou e ainda não passou. Coloque no Meu treino para acompanhar.')}</p>
          {rep.stuck.map((r) => (
            <Row key={r.chart.id} r={r} train
              sub={`${tn(r.tries, '{n} tentativa hoje', '{n} tentativas hoje')}${r.triesBefore ? ` · ${tn(r.triesBefore + r.tries, '{n} no total', '{n} no total')}` : ''}`}
              right={r.bestFail ? <span className="muted small">{t('melhor {s}', { s: fmtNum(r.bestFail) })}</span> : null} />
          ))}
        </section>
      )}

      {rep.levels.length > 0 && (
        <section className="card">
          <h3>{t('Por nível')}</h3>
          <div className="dr-levels">
            {rep.levels.map((l) => (
              <div key={`${l.mode}${l.level}`} className="dr-level">
                <Ball chart={l} size="sm" />
                <div className="dr-bar" aria-label={t('{p} de {n} passaram', { p: l.passes, n: l.tries })}>
                  <i style={{ width: `${(l.passes / l.tries) * 100}%` }} />
                </div>
                <span className="small"><b>{l.passes}</b>/{l.tries}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h3>{tn(tt.plays, '{n} jogada no dia', '{n} jogadas no dia')}</h3>
        <div className="dr-timeline">
          {[...rep.plays].reverse().map((p, i) => (
            <div key={i} className={`dr-play ${p.broken ? 'broken' : ''}`}>
              <small className="muted dr-time">{hhmm(p.at)}</small>
              <Ball chart={p.chart} size="sm" />
              <Link className="dr-play-title" to={`/musica/${p.chart.song.id}`}>{p.chart.song.title}</Link>
              {p.broken ? <span className="dr-broke">{t('Quebrou')}</span> : <Grade grade={p.grade} size="sm" />}
              <span className="dr-score">{fmtNum(p.score)}</span>
            </div>
          ))}
        </div>
      </section>

      {img && <ImageSheet blob={img} filename={`piu-stats-${rep.day}-${format}.png`} text={t('Meu dia de Pump It Up · PIU Stats')} onClose={() => setImg(null)}
        format={format} busy={making} onFormat={(f) => makeImage(f)} />}
    </div>
  );
}

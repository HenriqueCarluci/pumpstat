import AdSlot from '../components/AdSlot.jsx';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import PiuConnect from '../components/PiuConnect.jsx';
import { Ball, Grade, Jacket, Plate, ScoreCard, Stat, timeAgo } from '../components/ui.jsx';
import { chartLabel, fmtScore, GRADE_ORDER, gradeTier, pbTier, pumbility, pumbilitySuggestions, VERSIONS } from '../lib/piu.js';
import { locale, t } from '../lib/i18n.js';
import { ChevronRight, History, Logo, Tag, Target, Users, TrendingUp } from '../components/Icons.jsx';

export default function Home() {
  const { data, version, reload, presence } = useData();
  const [showTop, setShowTop] = useState(false);
  const [mode, setMode] = useState('D');

  const stats = useMemo(() => {
    const played = data.charts.filter((c) => c.score != null);
    const clears = played.filter((c) => !c.broken);
    const pb = pumbility(version, data.charts);
    const grades = Object.fromEntries(GRADE_ORDER.map((g) => [g, 0]));
    clears.forEach((c) => { if (c.grade in grades) grades[c.grade]++; });
    const avg = clears.length ? Math.round(clears.reduce((s, c) => s + c.score, 0) / clears.length) : 0;
    return { played, clears, pb, grades, avg };
  }, [data, version]);

  const levels = useMemo(() => {
    const out = [];
    const pool = data.charts.filter((c) => c.mode === mode);
    const max = Math.max(10, ...pool.map((c) => c.level));
    for (let lv = 1; lv <= max; lv++) {
      const cs = pool.filter((c) => c.level === lv);
      if (!cs.length) continue;
      const cl = cs.filter((c) => c.score != null && !c.broken);
      out.push({
        lv, total: cs.length, clears: cl.length,
        avg: cl.length ? Math.round(cl.reduce((s, c) => s + c.score, 0) / cl.length) : null,
      });
    }
    return out;
  }, [data, mode]);

  const p = data.profile;
  const maxGrade = Math.max(1, ...Object.values(stats.grades));
  const v = VERSIONS[version];

  if (!p && !stats.played.length) {
    return (
      <div className="page">
        <section className="card hero-connect">
          <div className="login-brand"><Logo size={30} /> StepClub</div>
          <p className="center">{t('Entre com a sua conta da Pump It Up e trazemos seus recordes da Phoenix 2 e da Phoenix.')}</p>
        </section>
        <section className="card"><PiuConnect onDone={() => reload()} /></section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card profile">
        <div className="avatar">{p?.avatar_url ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span>?</span>}</div>
        <div className="pinfo">
          <div className="ptitle">{p?.title || t('Sem título')}</div>
          <div className="pname">{p?.nickname || t('Faça a primeira sincronização')}</div>
          <div className="psync">{v.name} · {t('sincronizado {when}', { when: timeAgo(data.lastSync) })}</div>
        </div>
      </section>

      <TierCard version={version} points={p?.pumbility ?? stats.pb.total} estimated={stats.pb.total} history={data.pumbilityHistory} charts={data.charts} />

      <div className="quick-links">
        <Link to="/online" className="ql"><span className="dot-on" /> {t('Online')}{presence.online ? ` (${presence.online})` : ''}</Link>
        <Link to="/progresso" className="ql"><TrendingUp size={16} /> {t('Progresso')}</Link>
        <Link to="/recomendacoes" className="ql"><Target size={16} /> {t('Recomendadas')}</Link>
        <Link to="/titulos" className="ql"><Tag size={16} /> {t('Títulos')}</Link>
        <Link to="/jogadores" className="ql"><Users size={16} /> {t('Amigos')}</Link>
        <Link to="/recentes" className="ql"><History size={16} /> {t('Recentes')}</Link>
      </div>

      <section className="stats">
        <Stat label={t('Charts jogados')} value={stats.played.length} sub={t('de {n}', { n: data.charts.length })} />
        <Stat label={t('Clears')} value={stats.clears.length} />
        <Stat label={t('Média')} value={stats.avg ? fmtScore(stats.avg) : '—'} />
      </section>
      <AdSlot place="home" />

      <section className="card">
        <h3>{t('Grades')}</h3>
        <div className="gradebars">
          {GRADE_ORDER.filter((g) => stats.grades[g] > 0).map((g) => (
            <Link key={g} to={`/musicas?g=${encodeURIComponent(g)}&o=best`} className="gb" title={t('Ver músicas com {g}', { g })}>
              <span className="gb-l"><Grade grade={g} size="sm" /></span>
              <span className="gb-bar"><i className={`g-${gradeTier(g)}`} style={{ width: `${(stats.grades[g] / maxGrade) * 100}%` }} /></span>
              <span className="gb-n">{stats.grades[g]} ›</span>
            </Link>
          ))}
          {!stats.clears.length && <p className="muted">{t('Nenhum clear ainda nesta versão.')}</p>}
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>{t('Progresso por nível')}</h3>
          <div className="seg sm">
            {['S', 'D'].map((m) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'S' ? 'Single' : 'Double'}</button>)}
          </div>
        </div>
        <div className="levels">
          {levels.map((l) => (
            <Link key={l.lv} to={`/tier?m=${mode}&l=${l.lv}`} className="lvl">
              <Ball chart={{ mode, level: l.lv }} size="sm" />
              <div className="lvl-bar"><i style={{ width: `${(l.clears / l.total) * 100}%` }} /></div>
              <span className="lvl-n">{l.clears}/{l.total}</span>
              <span className="lvl-a">{l.avg ? fmtScore(l.avg) : ''}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>{t('Top 50 do PUMBILITY')} <span className="muted">({t('estimativa')})</span></h3>
          <button className="link" onClick={() => setShowTop((s) => !s)}>{showTop ? t('Ocultar') : t('Mostrar')}</button>
        </div>
        {showTop && (
          <ol className="toplist">
            {stats.pb.top.map(({ chart: c, value }) => (
              <li key={c.id}>
                <Link to={`/musica/${c.song.id}`}>
                  <Jacket song={c.song} width={64} />
                  <span className="t">{c.song.title}</span>
                  <Ball chart={c} size="sm" />
                  <Grade grade={c.grade} size="sm" />
                  <Plate plate={c.plate} />
                  <span className="val">{value.toFixed(2)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.plays.length > 0 && (
        <section className="card">
          <div className="row-between"><h3>{t('Últimas jogadas')}</h3><Link className="link" to="/recentes">{t('Ver todas')}</Link></div>
          <div className="cards">
            {data.plays.slice(0, 4).map((pl, i) => (
              <ScoreCard key={i} chart={pl.chart} score={pl.score} grade={pl.grade} plate={pl.plate}
                broken={pl.broken} date={pl.playedAt} to={`/musica/${pl.chart.song.id}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Spark({ points }) {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => Number(p[1]));
  const min = Math.min(...vals); const max = Math.max(...vals);
  const w = 120; const h = 40;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${(i / (vals.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ');
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-label={t('Evolução do PUMBILITY')}><path d={d} /></svg>;
}

function TierCard({ version, points, estimated, history, charts }) {
  const fmt = (n) => Number(n).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ideas = useMemo(() => pumbilitySuggestions(version, charts), [version, charts]);
  if (version !== 'phoenix2') {
    return (
      <section className="card pumb">
        <div className="pumb-main">
          <div className="l">PUMBILITY</div>
          <div className="v">{fmt(points)}</div>
          <div className="s">Phoenix · {t('estimado {v}', { v: fmt(estimated) })}</div>
        </div>
        <Spark points={history} />
      </section>
    );
  }
  const tier = pbTier(points);
  return (
    <section className="card pumb tier-card">
      <div className="tier-top">
        {tier.icon ? <img className="tier-icon" src={tier.icon} alt="" referrerPolicy="no-referrer" /> : <div className="tier-icon none">PB</div>}
        <div className="pumb-main">
          <div className="l">PUMBILITY · {t(tier.name)}{tier.lv ? ` LV.${tier.lv}` : ''}</div>
          <div className="v">{fmt(points)}</div>
          <div className="s">{t('estimado {v}', { v: fmt(estimated) })}</div>
        </div>
        <Spark points={history} />
      </div>
      {tier.nextLabel && (
        <>
          <div className="tier-bar"><i style={{ width: `${Math.min(100, tier.progress * 100)}%` }} /></div>
          <div className="tier-next small">
            {t('Faltam')} <b>{fmt(tier.toNextLv)}</b> {t('para')} <b>{tier.nextLabel}</b>
            {tier.nextTier && tier.toNextTier !== tier.toNextLv && <> · <b>{fmt(tier.toNextTier)}</b> {t('para')} <b>{tier.nextTier.name}</b></>}
          </div>
        </>
      )}
      {ideas.length > 0 && (
        <div className="ideas">
          <div className="ideas-h">{t('Como subir')}</div>
          {ideas.map((i, k) => (
            i.kind === 'grade' ? (
              <Link key={k} to={`/musica/${i.chart.song.id}`} className="idea">
                <Ball chart={i.chart} size="sm" />
                <span className="t">{i.chart.song.title}<small>{t('+{n} pontos para', { n: fmtScore(i.need) })} <b>{i.grade}</b></small></span>
                <span className="gain">+{i.gain.toFixed(1)}</span>
              </Link>
            ) : (
              <Link key={k} to={`/tier?m=${i.mode}&l=${i.level}`} className="idea">
                <Ball chart={{ mode: i.mode, level: i.level }} size="sm" />
                <span className="t">{t('Um {c} novo com {g}', { c: chartLabel({ mode: i.mode, level: i.level }), g: i.grade })}<small>{t('entra no top 50')}</small></span>
                <span className="gain">+{i.gain.toFixed(1)}</span>
              </Link>
            )
          ))}
          <Link to="/recomendacoes" className="link">{t('Ver músicas recomendadas para subir')} <ChevronRight size={14} /></Link>
        </div>
      )}
    </section>
  );
}

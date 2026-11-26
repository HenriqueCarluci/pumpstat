import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import PiuConnect from '../components/PiuConnect.jsx';
import { Ball, Grade, Jacket, Plate, ScoreCard, Stat, timeAgo } from '../components/ui.jsx';
import { fmtScore, GRADE_ORDER, gradeTier, pumbility, VERSIONS } from '../lib/piu.js';

export default function Home() {
  const { data, version, reload } = useData();
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
    for (let lv = max; lv >= 1; lv--) {
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
          <div className="login-brand"><span className="logo">▲</span> StepClub</div>
          <p className="center">Conecte sua conta da Pump It Up para trazer seus recordes da Phoenix 2 e da Phoenix.</p>
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
          <div className="ptitle">{p?.title || 'Sem título'}</div>
          <div className="pname">{p?.nickname || 'Faça a primeira sincronização'}</div>
          <div className="psync">{v.name} · sincronizado {timeAgo(data.lastSync)}</div>
        </div>
      </section>

      <section className="card pumb">
        <div className="pumb-main">
          <div className="l">PUMBILITY</div>
          <div className="v">{p?.pumbility != null ? Number(p.pumbility).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</div>
          <div className="s">oficial · estimado {stats.pb.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <Spark points={data.pumbilityHistory} />
      </section>

      <section className="stats">
        <Stat label="Charts jogados" value={stats.played.length} sub={`de ${data.charts.length}`} />
        <Stat label="Clears" value={stats.clears.length} />
        <Stat label="Média" value={stats.avg ? fmtScore(stats.avg) : '—'} />
      </section>

      <section className="card">
        <h3>Grades</h3>
        <div className="gradebars">
          {GRADE_ORDER.filter((g) => stats.grades[g] > 0).map((g) => (
            <div key={g} className="gb">
              <span className="gb-l"><Grade grade={g} size="sm" /></span>
              <span className="gb-bar"><i className={`g-${gradeTier(g)}`} style={{ width: `${(stats.grades[g] / maxGrade) * 100}%` }} /></span>
              <span className="gb-n">{stats.grades[g]}</span>
            </div>
          ))}
          {!stats.clears.length && <p className="muted">Nenhum clear ainda nesta versão.</p>}
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Progresso por nível</h3>
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
          <h3>Top 50 do PUMBILITY <span className="muted">(estimativa)</span></h3>
          <button className="link" onClick={() => setShowTop((s) => !s)}>{showTop ? 'Ocultar' : 'Mostrar'}</button>
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
          <div className="row-between"><h3>Últimas jogadas</h3><Link className="link" to="/recentes">Ver todas</Link></div>
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
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-label="Evolução do PUMBILITY"><path d={d} /></svg>;
}

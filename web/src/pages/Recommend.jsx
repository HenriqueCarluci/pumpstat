import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { Ball, Grade, Jacket } from '../components/ui.jsx';
import { chartTier, fmtScore, TIERS } from '../lib/piu.js';
import { recommendations } from '../lib/recommend.js';
import { topStyles, useStyles } from '../lib/style.js';
import { Chips } from './Songs.jsx';

export default function Recommend() {
  const { data, version } = useData();
  const [mode, setMode] = useState('all');
  const [tab, setTab] = useState('fresh');
  const rec = useMemo(() => recommendations(version, data.charts), [version, data]);
  const list = (tab === 'fresh' ? rec.fresh : rec.improve).filter((r) => mode === 'all' || r.chart.mode === mode).slice(0, 40);
  const styleOf = useStyles(list.map((r) => r.chart.songId));

  return (
    <div className="page">
      <h2>Recomendadas para você</h2>
      <p className="muted small">
        PUMBILITY {Math.round(rec.total).toLocaleString('pt-BR')}
        {rec.full ? <> · um chart novo precisa valer mais de <b>{rec.floor.toFixed(1)}</b> para entrar no seu top 50</> : <> · seu top 50 ainda não está cheio, qualquer chart nível 10+ soma</>}.
        A nota esperada vem das suas notas em charts do mesmo nível, ajustada pela dificuldade de cada chart.
      </p>
      <Chips value={tab} onChange={setTab} options={[['fresh', `Para jogar (${rec.fresh.length})`], ['improve', `Melhorar recorde (${rec.improve.length})`]]} />
      <Chips value={mode} onChange={setMode} options={[['all', 'Todos'], ['S', 'Single'], ['D', 'Double']]} />

      {!list.length && <p className="empty">{data.charts.some((c) => c.score != null) ? 'Nada aqui por enquanto. Jogue mais alguns charts de nível 10+ para eu entender seu nível.' : 'Sincronize suas notas para receber recomendações.'}</p>}

      <div className="recs">
        {list.map((r) => {
          const c = r.chart;
          const tier = TIERS.find((t) => t.id === chartTier(c));
          return (
            <Link key={c.id} to={`/musica/${c.songId}`} className="rec">
              <Jacket song={c.song} width={84} />
              <div className="rec-main">
                <div className="title">{c.song.title}</div>
                <div className="rec-line">
                  <Ball chart={c} size="sm" />
                  {tab === 'fresh'
                    ? <span className="muted small">esperado ~{fmtScore(Math.round(r.expected / 1000) * 1000)}</span>
                    : <span className="muted small">{fmtScore(c.score)} · faltam {fmtScore(r.need)}</span>}
                  <Grade grade={r.grade} size="sm" />
                  {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{tier.label}</span>}
                </div>
                <div className="rec-style">
                  {topStyles(styleOf(c)).map((k) => <span key={k.id} className="st-chip" style={{ '--c': k.color }}>{k.label} {Math.round(k.v)}%</span>)}
                </div>
              </div>
              <div className="rec-gain"><b>+{r.gain.toFixed(1)}</b><small>PUMBILITY</small></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

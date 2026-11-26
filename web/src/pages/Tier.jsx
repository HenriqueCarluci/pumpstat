import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { Ball, Grade, Jacket, Plate } from '../components/ui.jsx';
import { chartTier, fmtScore, gradeRank, TIERS } from '../lib/piu.js';
import { Chips } from './Songs.jsx';
import { usePrefs } from '../lib/prefs.js';
import { t } from '../lib/i18n.js';

export default function Tier() {
  const { data } = useData();
  const [prefs] = usePrefs();
  const [params, setParams] = useSearchParams();
  const mode = params.get('m') || 'D';
  const levels = useMemo(() => [...new Set(data.charts.filter((c) => c.mode === mode).map((c) => c.level))].sort((a, b) => a - b), [data, mode]);
  const level = +(params.get('l') || (mode === 'C' ? levels[0] : 20));
  const set = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  const charts = data.charts.filter((c) => c.mode === mode && c.level === level);
  const groups = TIERS.map((x) => ({
    ...x,
    charts: charts.filter((c) => chartTier(c) === x.id)
      .sort((a, b) => (b.scoringLevel ?? 0) - (a.scoringLevel ?? 0) || a.song.title.localeCompare(b.song.title)),
  })).filter((g) => g.charts.length);

  const played = charts.filter((c) => c.score != null);
  const clears = played.filter((c) => !c.broken);
  const best = [...clears].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))[0];

  return (
    <div className="page">
      <div className="filters">
        <Chips value={mode} onChange={(v) => set('m', v)} options={[['S', 'Single'], ['D', 'Double'], ['C', 'Co-op']]} />
        <div className="levelpick">
          {levels.map((l) => (
            <button key={l} className={l === level ? 'on' : ''} onClick={() => set('l', l)}>{mode === 'C' ? `×${l}` : l}</button>
          ))}
        </div>
      </div>

      <section className="tier-head card">
        <Ball chart={{ mode, level }} size="lg" />
        <div>
          <div className="big">{clears.length}<span className="muted">/{charts.length}</span></div>
          <div className="muted">{t('clears · {n} quebrados', { n: played.length - clears.length })}</div>
        </div>
        {best && <div className="tier-best"><span className="muted">{t('melhor')}</span><Grade grade={best.grade} size="sm" /></div>}
      </section>

      {groups.map((g) => (
        <section key={g.id} className={`tier tier-${g.id}`}>
          <div className="tier-label"><b>{g.short}</b><span>{t(g.label)}</span><em>{g.charts.filter((c) => c.score != null && !c.broken).length}/{g.charts.length}</em></div>
          <div className="tier-grid">
            {g.charts.map((c) => (
              <Link key={c.id} to={`/musica/${c.song.id}`} className={`tile ${c.score != null ? (c.broken ? 'broken' : 'clear') : ''}`}
                title={`${c.song.title}${c.scoringLevel ? ` · ${c.scoringLevel.toFixed(1)}` : ''}`}>
                <div className="tile-art">
                  <Jacket song={c.song} width="100%" />
                  {c.score != null && (
                    <div className={`tile-grade g-size-${prefs.tierGrade}`}><Grade grade={c.grade} broken={c.broken} size="md" /></div>
                  )}
                  {c.plate && <div className="tile-plate"><Plate plate={c.plate} size="xs" /></div>}
                </div>
                <div className="tile-name">{c.song.title}</div>
                {c.score != null && <div className="tile-score">{fmtScore(c.score)}</div>}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <p className="muted small center">{t('Dificuldade relativa dentro do nível segundo o PIU Scores e os votos da comunidade do StepClub.')}</p>
    </div>
  );
}

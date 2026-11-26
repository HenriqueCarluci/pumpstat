import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { Ball, Grade, Jacket, Plate } from '../components/ui.jsx';
import { chartTier, fmtScore, gradeRank, legacyOf, TIERS } from '../lib/piu.js';
import { LegacyToggle } from './Song.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { Vote } from '../components/Icons.jsx';
import { Chips } from './Songs.jsx';
import { usePrefs } from '../lib/prefs.js';
import { t } from '../lib/i18n.js';

export default function Tier() {
  const { data, version, plan } = useData();
  const [prefs, setPrefs] = usePrefs();
  const sizeLabel = { sm: t('Capas pequenas'), md: t('Capas médias'), lg: t('Capas grandes') };
  const legacy = (c) => legacyOf(c, version, prefs.legacyP1);
  const [params, setParams] = useSearchParams();
  // Sem parâmetros na URL, abre no último modo/nível usado (guardado no aparelho).
  const last = prefs.tierLast || {};
  const mode = params.get('m') || prefs.tierMode || 'D';
  const levels = useMemo(() => [...new Set(data.charts.filter((c) => c.mode === mode).map((c) => c.level))].sort((a, b) => a - b), [data, mode]);
  const fallback = (m, lv) => (lv.includes(last[m]) ? last[m] : (m === 'C' ? lv[0] : (lv.includes(20) ? 20 : lv[0])));
  const asked = +params.get('l');
  const level = levels.includes(asked) ? asked : fallback(mode, levels);
  const set = (k, v) => {
    const p = new URLSearchParams(params);
    if (k === 'm') {
      const lv = [...new Set(data.charts.filter((c) => c.mode === v).map((c) => c.level))].sort((a, b) => a - b);
      p.set('m', v); p.set('l', fallback(v, lv));
    } else {
      p.set('m', mode); p.set(k, v);
    }
    setParams(p, { replace: true });
  };
  // Guarda o que está na tela (vale também para quem chega por um link da Início).
  useEffect(() => {
    if (level == null || Number.isNaN(level)) return;
    if (prefs.tierMode !== mode || last[mode] !== level) setPrefs({ tierMode: mode, tierLast: { ...last, [mode]: level } });
  }, [mode, level]);

  const charts = data.charts.filter((c) => c.mode === mode && c.level === level);
  const groups = TIERS.map((x) => ({
    ...x,
    charts: charts.filter((c) => chartTier(c) === x.id)
      .sort((a, b) => (b.scoringLevel ?? 0) - (a.scoringLevel ?? 0) || a.song.title.localeCompare(b.song.title)),
  })).filter((g) => g.charts.length);

  const played = charts.filter((c) => c.score != null);
  const clears = played.filter((c) => !c.broken);
  const best = [...clears].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))[0];
  const legacyN = charts.filter((c) => legacy(c)).length;
  const hasLegacy = version === 'phoenix2' && charts.some((c) => c.score == null && c.otherScore != null);

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
          {legacyN > 0 && <div className="muted small">{t('+{n} com recorde legado da Phoenix', { n: legacyN })}</div>}
        </div>
        {best && <div className="tier-best"><span className="muted">{t('melhor')}</span><Grade grade={best.grade} size="sm" /></div>}
      </section>

      <div className="tier-tools">
        {hasLegacy && <LegacyToggle />}
        <div className="seg sm tier-size" role="group" aria-label={t('Tamanho das capas')} title={t('Tamanho das capas: menor mostra mais músicas por linha')}>
          {[['sm', 'P'], ['md', 'M'], ['lg', 'G']].map(([k, l]) => <button key={k} className={(prefs.tierSize || 'md') === k ? 'on' : ''} onClick={() => setPrefs({ tierSize: k })} aria-label={sizeLabel[k]}>{l}</button>)}
        </div>
        {isOn(plan, 'tier_votes') && <Link to="/votacoes" className="chip-toggle"><Vote size={14} /> {t('Votações de tier')}</Link>}
      </div>

      {groups.map((g) => (
        <section key={g.id} className={`tier tier-${g.id}`}>
          <div className="tier-label"><b>{g.short}</b><span>{t(g.label)}</span><em>{g.charts.filter((c) => c.score != null && !c.broken).length}/{g.charts.length}</em></div>
          <div className={`tier-grid size-${prefs.tierSize || 'md'}`}>
            {g.charts.map((c) => { const lg = legacy(c); return (
              <Link key={c.id} to={`/musica/${c.song.id}?c=${c.id}`} className={`tile ${c.score != null ? (c.broken ? 'broken' : 'clear') : lg ? 'legacy' : ''}`}
                title={`${c.song.title}${c.scoringLevel ? ` · ${c.scoringLevel.toFixed(1)}` : ''}`}>
                <div className="tile-art">
                  <Jacket song={c.song} width="100%" />
                  {c.score != null && (
                    <div className={`tile-grade g-size-${prefs.tierGrade}`}><Grade grade={c.grade} broken={c.broken} size="md" /></div>
                  )}
                  {lg && (
                    <div className={`tile-grade legacy g-size-${prefs.tierGrade}`}><Grade grade={lg.grade} size="md" /></div>
                  )}
                  {lg && <div className="tile-legacy" title={t('Legado Phoenix')}>P1</div>}
                  {c.plate && <div className="tile-plate"><Plate plate={c.plate} size="xs" /></div>}
                </div>
                <div className="tile-name">{c.song.title}</div>
                {c.score != null && <div className="tile-score">{fmtScore(c.score)}</div>}
                {lg && <div className="tile-score legacy">P1 · {fmtScore(lg.score)}</div>}
              </Link>
            ); })}
          </div>
        </section>
      ))}
      <AdSlot place="tier" />
      <p className="muted small center">{t('Dificuldade relativa dentro do nível segundo o PIU Scores e os votos da comunidade do PIU Stats.')}</p>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { Ball, Grade, Jacket, Plate } from '../components/ui.jsx';
import { chartTier, fmtScore, gradeRank, legacyOf, TIERS } from '../lib/piu.js';
import { LegacyToggle } from './Song.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { BookmarkCheck, Shuffle, Sparkles, Vote, Zap } from '../components/Icons.jsx';
import { hasGimmick, isSpecial } from '../lib/special.js';
import { Chips } from './Songs.jsx';
import { usePrefs } from '../lib/prefs.js';
import { t } from '../lib/i18n.js';
import { ChartQuickSheet, useLongPress } from '../components/ChartQuickSheet.jsx';
import { useTraining } from '../lib/training.js';

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

  const hasNew = data.songs.some((x) => x.isNew);
  const onlyNew = hasNew && params.get('n') === '1';
  const charts = data.charts.filter((c) => c.mode === mode && c.level === level && (!onlyNew || c.song.isNew));
  // charts com gimmick ou fora da curva ficam numa seção própria, fora do ranking normal
  const specials = charts.filter(isSpecial).sort((a, b) => a.song.title.localeCompare(b.song.title));
  const groups = TIERS.map((x) => ({
    ...x,
    charts: charts.filter((c) => !isSpecial(c) && chartTier(c) === x.id)
      .sort((a, b) => (b.scoringLevel ?? 0) - (a.scoringLevel ?? 0) || a.song.title.localeCompare(b.song.title)),
  })).filter((g) => g.charts.length);

  const played = charts.filter((c) => c.score != null);
  const clears = played.filter((c) => !c.broken);
  const best = [...clears].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))[0];
  const legacyN = charts.filter((c) => legacy(c)).length;
  const hasLegacy = version === 'phoenix2' && charts.some((c) => c.score == null && c.otherScore != null);

  const [quick, setQuick] = useState(null);
  const hold = useLongPress(setQuick);
  const training = useTraining();
  const tile = (c) => { const lg = legacy(c); return (
              <Link key={c.id} to={`/musica/${c.song.id}?c=${c.id}`} {...hold.bind(c.id, c)} draggable={false}
                className={`tile ${c.score != null ? (c.broken ? 'broken' : 'clear') : lg ? 'legacy' : ''} ${hold.pressed === c.id ? 'pressing' : ''}`}
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
                  {c.song.isNew && <div className="tile-new">NEW</div>}
                  {training?.has(c.id) && <div className="tile-train" title={t('No Meu treino')}><BookmarkCheck size={12} /></div>}
                  {isSpecial(c) && <div className="tile-special" title={hasGimmick(c) ? t('Gimmick') : t('Fora da curva')}>{hasGimmick(c) ? <Zap size={12} /> : <Shuffle size={12} />}</div>}
                </div>
                <div className="tile-name">{c.song.title}</div>
                {c.score != null && <div className="tile-score">{fmtScore(c.score)}</div>}
                {lg && <div className="tile-score legacy">P1 · {fmtScore(lg.score)}</div>}
              </Link>
  ); };

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
        {hasNew && (
          <button type="button" className={`chip-toggle new-toggle ${onlyNew ? 'on' : ''}`} aria-pressed={onlyNew}
            onClick={() => { const p = new URLSearchParams(params); if (onlyNew) p.delete('n'); else p.set('n', '1'); setParams(p, { replace: true }); }}>
            <Sparkles size={14} /> {t('Só músicas novas')}
          </button>
        )}
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
            {g.charts.map(tile)}
          </div>
        </section>
      ))}
      <ChartQuickSheet chart={quick} onClose={() => setQuick(null)} />
      {isOn(plan, 'training') && <p className="muted tiny tier-hint">{t('Dica: segure uma música para colocar no Meu treino.')}</p>}
      {onlyNew && !charts.length && <p className="empty">{t('Nenhuma música nova neste nível.')}</p>}

      {specials.length > 0 && (
        <section className="tier tier-special">
          <div className="tier-label"><b>U</b><span>Unique</span><em>{specials.filter((c) => c.score != null && !c.broken).length}/{specials.length}</em></div>
          <p className="muted small tier-special-note">{t('Charts Unique: gimmick ou steps muito fora da curva. Não entram no ranking do nível porque a dificuldade depende de outra coisa.')}</p>
          <div className={`tier-grid size-${prefs.tierSize || 'md'}`}>
            {specials.map(tile)}
          </div>
        </section>
      )}
      <AdSlot place="tier" />
      <p className="muted small center">{t('Dificuldade relativa dentro do nível segundo o PIU Scores e os votos da comunidade do PIU Stats.')}</p>
    </div>
  );
}

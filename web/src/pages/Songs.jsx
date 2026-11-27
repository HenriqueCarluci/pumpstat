import { hasGimmick, isSpecial } from '../lib/special.js';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { SongRow, PipLegend } from '../components/ui.jsx';
import { locale, t, tn } from '../lib/i18n.js';
import { Grade } from '../components/ui.jsx';
import { History, X } from '../components/Icons.jsx';
import { usePrefs } from '../lib/prefs.js';
import AdSlot from '../components/AdSlot.jsx';
import { adsConfig } from '../lib/ads.js';
import { legacyOf, needsRise } from '../lib/piu.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
const cleared = (c) => c.score != null && !c.broken;

export default function Songs() {
  const { data, version, plan } = useData();
  const ads = adsConfig(plan);
  const [prefs, setPrefs] = usePrefs();
  const isP2 = version === 'phoenix2';
  const showLegacy = isP2 && prefs.legacyP1;
  const legacy = (c) => legacyOf(c, version, showLegacy);
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const [legend, setLegend] = useState(false);

  // maior nível passado por modo: base de "Meu nível", "Para treinar" e da ordem "Perto do meu nível"
  const top = useMemo(() => {
    const m = { S: 0, D: 0 };
    for (const c of data.charts) if ((c.mode === 'S' || c.mode === 'D') && cleared(c) && c.level > m[c.mode]) m[c.mode] = c.level;
    return m;
  }, [data]);
  const hasTop = top.S > 0 || top.D > 0;

  const q = params.get('q') || '';
  const mode = params.get('m') || 'all';
  const status = params.get('s') || 'all';
  const grade = params.get('g') || '';
  const sort = params.get('o') || (hasTop ? 'near' : 'az');
  const minL = +(params.get('min') || 1);
  const maxL = +(params.get('max') || 28);
  const spec = params.get('x') || 'all';
  const myTop = mode === 'S' || mode === 'D' ? top[mode] : Math.max(top.S, top.D);

  const set = (k, v) => setMany({ [k]: v });
  function setMany(obj) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(obj)) { if (v === '' || v == null) p.delete(k); else p.set(k, String(v)); }
    setParams(p, { replace: true });
  }
  const setLevels = (a, b) => setMany({ min: a <= 1 ? '' : a, max: b >= 28 ? '' : b });

  const chartFilter = useMemo(() => (c) =>
    (mode === 'all' || c.mode === mode || (mode === 'rise' && needsRise(c))) &&
    (c.mode === 'C' || (c.level >= minL && c.level <= maxL)) &&
    (status === 'all' || (status === 'played' ? c.score != null : status === 'unplayed' ? c.score == null
      : status === 'legacy' ? c.score == null && c.otherScore != null
        : status === 'todo' ? !cleared(c)
          : c.score != null && !c.broken && c.plate !== 'PG')) &&
    (!grade || (c.score != null && !c.broken && c.grade === grade)) &&
    (spec === 'all' || (spec === 'esp' ? isSpecial(c) : spec === 'gim' ? hasGimmick(c) : !isSpecial(c))),
  [mode, minL, maxL, status, grade, spec]);

  const list = useMemo(() => {
    const nq = norm(q);
    let out = data.songs.filter((s) =>
      (!nq || norm(s.title).includes(nq) || norm(s.artist).includes(nq)) && s.charts.some(chartFilter));
    const byTitle = (a, b) => a.title.localeCompare(b.title, locale(), { sensitivity: 'base' });
    const best = (s) => Math.max(0, ...s.charts.filter(chartFilter).map((c) => c.score || 0));
    const recent = (s) => Math.max(0, ...s.charts.map((c) => (c.achievedAt ? Date.parse(c.achievedAt) : 0)));
    const near = (s) => Math.min(99, ...s.charts.filter((c) => chartFilter(c) && (c.mode === 'S' || c.mode === 'D') && top[c.mode] > 0)
      .map((c) => Math.abs(c.level - (top[c.mode] + 1)) + (cleared(c) ? 0.5 : 0)));
    if (sort === 'az') out = out.sort(byTitle);
    if (sort === 'best') out = out.sort((a, b) => best(b) - best(a));
    if (sort === 'recent') out = out.sort((a, b) => recent(b) - recent(a));
    if (sort === 'bpm') out = out.sort((a, b) => parseFloat(b.bpm || 0) - parseFloat(a.bpm || 0));
    if (sort === 'new') out = out.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || byTitle(a, b));
    if (sort === 'near') out = out.map((s) => [near(s), s]).sort((a, b) => a[0] - b[0] || byTitle(a[1], b[1])).map((x) => x[1]);
    return out;
  }, [data, q, chartFilter, sort, top]);

  const SPEC = { esp: 'Unique', gim: t('Com gimmick'), normal: t('Sem Unique') };
  const STATUS = { played: t('Jogados'), unplayed: t('Não jogados'), todo: t('Não passados'), improve: t('Sem PG'), legacy: t('Só legado P1') };
  const active = [
    ...(minL > 1 || maxL < 28 ? [[t('Nível {a}–{b}', { a: minL, b: maxL }), () => setLevels(1, 28)]] : []),
    ...(spec !== 'all' ? [[SPEC[spec], () => set('x', '')]] : []),
    ...(status !== 'all' ? [[STATUS[status] || status, () => set('s', '')]] : []),
  ];

  return (
    <div className="page songs-page">
      <div className="songs-head">
        <div className="searchbar">
          <input type="search" placeholder={t('Buscar música ou artista')} value={q} onChange={(e) => set('q', e.target.value)} />
        </div>
        <div className="songs-bar">
          <Chips value={mode} onChange={(v) => set('m', v === 'all' ? '' : v)}
            options={[['all', t('Tudo')], ['S', 'Single'], ['D', 'Double'], ...(isP2 ? [['HD', 'Half-Double']] : []), ['C', 'Co-op'], ...(isP2 ? [['rise', 'R!SE']] : [])]} />
          <button type="button" className={`filter-btn ${active.length ? 'on' : ''}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
            <FilterIcon /> {t('Filtros')}{active.length > 0 && <b>{active.length}</b>}
          </button>
        </div>
        {active.length > 0 && (
          <div className="active-filters">
            {active.map(([label, clear]) => (
              <button key={label} type="button" className="af-chip" onClick={clear} aria-label={t('Remover filtro: {f}', { f: label })}>
                {label} <X size={12} />
              </button>
            ))}
          </div>
        )}
      </div>
      {grade && (
        <div className="grade-filter">
          <Grade grade={grade} size="sm" />
          <span>{t('Charts que você passou com {g}', { g: grade })} · {tn(list.reduce((n, s) => n + s.charts.filter(chartFilter).length, 0), '{n} chart', '{n} charts')}</span>
          <button className="link" onClick={() => set('g', '')}><X size={14} /> {t('Limpar')}</button>
        </div>
      )}
      <div className="count muted">
        {tn(list.length, '{n} música', '{n} músicas')}
        <button type="button" className={`legend-btn ${legend ? 'on' : ''}`} onClick={() => setLegend((v) => !v)} aria-expanded={legend} aria-label={t('Legenda')}>i</button>
      </div>
      {legend && <PipLegend legacy={showLegacy} />}
      <div className="songlist">
        {list.slice(0, 400).map((s, i) => (
          <Fragment key={s.id}>
            {ads.show && i > 0 && i % ads.everyN === 0 && <AdSlot place="songs" seed={i / ads.everyN} />}
            <SongRow song={s} filter={chartFilter} legacy={showLegacy ? legacy : null} />
          </Fragment>
        ))}
        {list.length === 0 && (
          <div className="songs-empty muted">
            <p>{t('Nenhuma música com esses filtros.')}</p>
            {(active.length > 0 || q) && <button type="button" className="btn ghost" onClick={() => setMany({ min: '', max: '', x: '', s: '', q: '' })}>{t('Limpar filtros')}</button>}
          </div>
        )}
        {list.length > 400 && <p className="muted center">{t('Mostrando 400. Refine a busca para ver o resto.')}</p>}
      </div>

      {sheet && (
        <FilterSheet onClose={() => setSheet(false)} count={list.length}
          onReset={() => setMany({ min: '', max: '', x: '', s: '', o: '' })}>
          <section>
            <h4>{t('Nível')} <span className="fs-val">{minL}–{maxL}</span></h4>
            {hasTop && (
              <div className="chips wrap">
                <button className={minL === Math.max(1, myTop - 2) && maxL === Math.min(28, myTop + 1) ? 'on' : ''}
                  onClick={() => setLevels(Math.max(1, myTop - 2), Math.min(28, myTop + 1))}>{t('Meu nível')}</button>
                <button className={status === 'todo' && minL === Math.max(1, myTop - 1) && maxL === Math.min(28, myTop + 1) ? 'on' : ''}
                  onClick={() => setMany({ min: Math.max(1, myTop - 1) <= 1 ? '' : Math.max(1, myTop - 1), max: Math.min(28, myTop + 1), s: 'todo' })}>{t('Para treinar')}</button>
                <button className={minL === 1 && maxL === 28 ? 'on' : ''} onClick={() => setLevels(1, 28)}>{t('Todos os níveis')}</button>
              </div>
            )}
            <LevelRange min={minL} max={maxL} onChange={setLevels} />
          </section>
          <section>
            <h4>{t('Tipo de chart')}</h4>
            <Chips wrap value={spec} onChange={(v) => set('x', v === 'all' ? '' : v)}
              options={[['all', t('Todos os steps')], ['esp', 'Unique'], ['gim', t('Com gimmick')], ['normal', t('Sem Unique')]]} />
          </section>
          <section>
            <h4>{t('Suas jogadas')}</h4>
            <Chips wrap value={status} onChange={(v) => set('s', v === 'all' ? '' : v)}
              options={[['all', t('Tudo')], ['played', t('Jogados')], ['unplayed', t('Não jogados')], ['todo', t('Não passados')], ['improve', t('Sem PG')],
                ...(showLegacy ? [['legacy', t('Só legado P1')]] : [])]} />
            {isP2 && (
              <label className="fs-switch">
                <input type="checkbox" checked={!!prefs.legacyP1} onChange={() => { setPrefs({ legacyP1: !prefs.legacyP1 }); if (status === 'legacy') set('s', ''); }} />
                <span><History size={14} /> {t('Mostrar recordes da Phoenix (legado P1)')}</span>
              </label>
            )}
          </section>
          <section>
            <h4>{t('Ordenar')}</h4>
            <Chips wrap value={sort} onChange={(v) => set('o', v === (hasTop ? 'near' : 'az') ? '' : v)}
              options={[...(hasTop ? [['near', t('Perto do meu nível')]] : []), ['az', 'A–Z'], ['new', t('Novas primeiro')],
                ['best', t('Maior score')], ['recent', t('Recorde recente')], ['bpm', 'BPM']]} />
          </section>
        </FilterSheet>
      )}
    </div>
  );
}

function FilterSheet({ children, onClose, onReset, count }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t('Filtros')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <span className="sheet-grip" aria-hidden />
          <b>{t('Filtros')}</b>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Fechar')}><X size={18} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        <div className="sheet-foot">
          <button type="button" className="btn ghost" onClick={onReset}>{t('Limpar filtros')}</button>
          <button type="button" className="btn" onClick={onClose}>{t('Ver resultados ({n})', { n: count })}</button>
        </div>
      </div>
    </div>
  );
}

/** Faixa de nível com duas alças (1 a 28). */
function LevelRange({ min, max, onChange }) {
  const pct = (v) => ((v - 1) / 27) * 100;
  return (
    <div className="lv-range" style={{ '--a': `${pct(min)}%`, '--b': `${pct(max)}%` }}>
      <div className="lv-track" />
      <input type="range" min={1} max={28} value={min} aria-label={t('Nível mínimo')}
        onChange={(e) => onChange(Math.min(+e.target.value, max), max)} />
      <input type="range" min={1} max={28} value={max} aria-label={t('Nível máximo')}
        onChange={(e) => onChange(min, Math.max(+e.target.value, min))} />
      <div className="lv-ticks" aria-hidden><span>1</span><span>10</span><span>20</span><span>28</span></div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function Chips({ value, onChange, options, wrap = false }) {
  return (
    <div className={`chips ${wrap ? 'wrap' : ''}`}>
      {options.map(([v, l]) => (
        <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { SongRow } from '../components/ui.jsx';
import { locale, t, tn } from '../lib/i18n.js';
import { Grade } from '../components/ui.jsx';
import { History, X } from '../components/Icons.jsx';
import { usePrefs } from '../lib/prefs.js';
import { legacyOf } from '../lib/piu.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');

export default function Songs() {
  const { data, version } = useData();
  const [prefs, setPrefs] = usePrefs();
  const isP2 = version === 'phoenix2';
  const showLegacy = isP2 && prefs.legacyP1;
  const legacy = (c) => legacyOf(c, version, showLegacy);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const mode = params.get('m') || 'all';
  const status = params.get('s') || 'all';
  const grade = params.get('g') || '';
  const sort = params.get('o') || 'az';
  const minL = +(params.get('min') || 1);
  const maxL = +(params.get('max') || 28);

  const set = (k, v) => {
    const p = new URLSearchParams(params);
    if (v === '' || v == null) p.delete(k); else p.set(k, v);
    setParams(p, { replace: true });
  };

  const chartFilter = useMemo(() => (c) =>
    (mode === 'all' || c.mode === mode) &&
    (c.mode === 'C' || (c.level >= minL && c.level <= maxL)) &&
    (status === 'all' || (status === 'played' ? c.score != null : status === 'unplayed' ? c.score == null
      : status === 'legacy' ? c.score == null && c.otherScore != null
        : c.score != null && !c.broken && c.plate !== 'PG')) &&
    (!grade || (c.score != null && !c.broken && c.grade === grade)),
  [mode, minL, maxL, status, grade]);

  const list = useMemo(() => {
    const nq = norm(q);
    let out = data.songs.filter((s) =>
      (!nq || norm(s.title).includes(nq) || norm(s.artist).includes(nq)) && s.charts.some(chartFilter));
    const best = (s) => Math.max(0, ...s.charts.filter(chartFilter).map((c) => c.score || 0));
    const recent = (s) => Math.max(0, ...s.charts.map((c) => (c.achievedAt ? Date.parse(c.achievedAt) : 0)));
    if (sort === 'az') out = out.sort((a, b) => a.title.localeCompare(b.title, locale(), { sensitivity: 'base' }));
    if (sort === 'best') out = out.sort((a, b) => best(b) - best(a));
    if (sort === 'recent') out = out.sort((a, b) => recent(b) - recent(a));
    if (sort === 'bpm') out = out.sort((a, b) => parseFloat(b.bpm || 0) - parseFloat(a.bpm || 0));
    return out;
  }, [data, q, chartFilter, sort]);

  return (
    <div className="page">
      <div className="searchbar">
        <input type="search" placeholder={t('Buscar música ou artista')} value={q} onChange={(e) => set('q', e.target.value)} />
      </div>
      <div className="filters">
        <Chips value={mode} onChange={(v) => set('m', v === 'all' ? '' : v)}
          options={[['all', t('Todos')], ['S', 'Single'], ['D', 'Double'], ['C', 'Co-op']]} />
        <Chips value={status} onChange={(v) => set('s', v === 'all' ? '' : v)}
          options={[['all', t('Tudo')], ['played', t('Jogados')], ['unplayed', t('Não jogados')], ['improve', t('Sem PG')],
            ...(showLegacy ? [['legacy', t('Só legado P1')]] : [])]} />
        {isP2 && (
          <button className={`chip-toggle ${prefs.legacyP1 ? 'on' : ''}`} onClick={() => { setPrefs({ legacyP1: !prefs.legacyP1 }); if (status === 'legacy') set('s', ''); }}
            title={t('Mostrar os recordes da Phoenix nos charts que você ainda não jogou na Phoenix 2')}>
            <History size={14} /> {t('Legado P1')}
          </button>
        )}
        <div className="range">
          <label>{t('Nível')}
            <select value={minL} onChange={(e) => set('min', e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span>{t('até')}</span>
          <select value={maxL} onChange={(e) => set('max', e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={sort} onChange={(e) => set('o', e.target.value)} aria-label={t('Ordenar')}>
            <option value="az">A–Z</option>
            <option value="best">{t('Maior score')}</option>
            <option value="recent">{t('Recorde recente')}</option>
            <option value="bpm">BPM</option>
          </select>
        </div>
      </div>
      {grade && (
        <div className="grade-filter">
          <Grade grade={grade} size="sm" />
          <span>{t('Charts que você passou com {g}', { g: grade })} · {tn(list.reduce((n, s) => n + s.charts.filter(chartFilter).length, 0), '{n} chart', '{n} charts')}</span>
          <button className="link" onClick={() => set('g', '')}><X size={14} /> {t('Limpar')}</button>
        </div>
      )}
      <div className="count muted">{tn(list.length, '{n} música', '{n} músicas')}
        {showLegacy && <span className="legacy-note"> · <span className="pip legacy t-a single">P1</span> {t('= recorde legado da Phoenix, ainda sem nota na Phoenix 2')}</span>}
      </div>
      <div className="songlist">
        {list.slice(0, 400).map((s) => <SongRow key={s.id} song={s} filter={chartFilter} legacy={showLegacy ? legacy : null} />)}
        {list.length > 400 && <p className="muted center">{t('Mostrando 400. Refine a busca para ver o resto.')}</p>}
      </div>
    </div>
  );
}

export function Chips({ value, onChange, options }) {
  return (
    <div className="chips">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

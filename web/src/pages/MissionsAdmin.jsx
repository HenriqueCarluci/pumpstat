// Administração → Missões: tipos ligados e pesos, composição da semana, calibração das metas, troca e foco,
// pontuação e selos (liga/desliga), eventos e o painel das últimas semanas.
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { MISSION_DEFAULTS, MISSION_TYPES, TIERS } from '../lib/missions.js';
import { t, tErr } from '../lib/i18n.js';
import { Check, Plus, Trash2 } from '../components/Icons.jsx';

const TIER_LABEL = Object.fromEntries(TIERS);
const FOCUS_LABEL = { auto: 'Automático', level: 'Subir de nível', score: 'Melhorar notas', weak: 'Ponto fraco', fun: 'Só diversão' };
const num = (v, d) => (v === '' || v == null || Number.isNaN(Number(v)) ? d : Number(v));
const marks = (s) => String(s).split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 520).sort((a, b) => a - b);
const newId = () => `ev${Date.now().toString(36)}`;

export default function MissionsAdmin() {
  const { reloadPlan } = useData();
  const [all, setAll] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [stats, setStats] = useState(null);
  useEffect(() => {
    rpc('app_config').then(setAll).catch((e) => setErr(tErr(e.message)));
    rpc('admin_mission_stats').then(setStats).catch(() => setStats({ weeks: [], types: [] }));
  }, []);
  if (!all) return err ? <div className="form-err">{err}</div> : <p className="empty">{t('Carregando…')}</p>;
  const raw = all.missions || {};
  const c = { ...MISSION_DEFAULTS, ...raw, slots: { ...MISSION_DEFAULTS.slots, ...(raw.slots || {}) }, points_by: { ...MISSION_DEFAULTS.points_by, ...(raw.points_by || {}) }, types: raw.types || {} };
  const set = (patch) => { setSaved(false); setAll({ ...all, missions: { ...c, ...patch } }); };
  const setType = (id, patch) => set({ types: { ...c.types, [id]: { on: c.types[id]?.on !== false, w: c.types[id]?.w ?? 1, ...patch } } });
  const save = async () => {
    setErr('');
    try { await rpc('admin_set_config', { p_value: { ...all, missions: c } }); setSaved(true); reloadPlan(); } catch (e) { setErr(tErr(e.message)); }
  };
  const Num = ({ k, min, max, sub }) => {
    const v = sub ? c[sub][k] : c[k];
    return <input type="number" min={min} max={max} value={v ?? ''} onChange={(e) => {
      const n = Math.max(min, Math.min(max, num(e.target.value, min)));
      set(sub ? { [sub]: { ...c[sub], [k]: n } } : { [k]: n });
    }} />;
  };
  const Box = ({ k, label }) => (
    <label className="cfg-row"><span>{label}</span><input type="checkbox" checked={c[k] !== false} onChange={(e) => set({ [k]: e.target.checked })} /></label>
  );

  return (
    <div className="missions-admin">
      <p className="muted small">{t('As missões são montadas para cada pessoa na primeira abertura da semana, com base no histórico dela, e ficam fixas até domingo. Mudanças aqui valem para as semanas que ainda não começaram.')}</p>

      <div className="card">
        <h3>{t('Geral')}</h3>
        {Box({ k: 'focus', label: t('Deixar a pessoa escolher o foco da semana') })}
        {c.focus !== false && <div className="cfg-row"><span>{t('Trocas de foco por semana')}</span>{Num({ k: 'focus_changes', min: 0, max: 5 })}</div>}
        <div className="cfg-row"><span>{t('Trocas de missão por semana')}</span>{Num({ k: 'rerolls', min: 0, max: 5 })}</div>
        {Box({ k: 'no_repeat', label: t('Evitar repetir o tipo de missão da semana passada') })}
        {Box({ k: 'event_always', label: t('Evento ativo entra sempre como bônus') })}
      </div>

      <div className="card">
        <h3>{t('Composição da semana')}</h3>
        <div className="cfg-row"><span>{t('Missões fáceis (hábito)')}</span>{Num({ k: 'easy', sub: 'slots', min: 0, max: 3 })}</div>
        <div className="cfg-row"><span>{t('Missões médias')}</span>{Num({ k: 'medium', sub: 'slots', min: 0, max: 4 })}</div>
        <div className="cfg-row"><span>{t('Desafios')}</span>{Num({ k: 'hard', sub: 'slots', min: 0, max: 2 })}</div>
        <div className="cfg-row"><span>{t('Chance de missão bônus (%)')}</span>{Num({ k: 'bonus_pct', min: 0, max: 100 })}</div>
        <p className="muted tiny">{t('Total de {n} missões por semana, mais o bônus quando sai.', { n: (c.slots.easy || 0) + (c.slots.medium || 0) + (c.slots.hard || 0) })}</p>
      </div>

      <div className="card">
        <h3>{t('Calibração das metas')}</h3>
        <div className="cfg-row"><span>{t('Semanas de histórico usadas')}</span>{Num({ k: 'lookback', min: 2, max: 12 })}</div>
        <div className="cfg-row"><span>{t('Quanto a meta puxa acima da média da pessoa (%)')}</span>{Num({ k: 'stretch', min: 0, max: 60 })}</div>
        <div className="cfg-row"><span>{t('Alívio depois de 2 semanas fracas (%)')}</span>{Num({ k: 'ease', min: 0, max: 60 })}</div>
        <div className="cfg-row"><span>{t('Aumento depois de fechar a semana em até 4 dias (%)')}</span>{Num({ k: 'harder', min: 0, max: 60 })}</div>
        <p className="muted tiny">{t('A meta parte da mediana das semanas em que a pessoa jogou. Quem tem pouco histórico recebe as metas padrão.')}</p>
      </div>

      <div className="card">
        <h3>{t('Tipos de missão')}</h3>
        <p className="muted tiny">{t('Peso: quanto maior, mais vezes o tipo é sorteado. 0 ou desligado: nunca aparece.')}</p>
        {TIERS.map(([tier, label]) => (
          <div key={tier} className="mtype-group">
            <h4 className="cfg-sub">{t(label)}</h4>
            {MISSION_TYPES.filter((x) => x.tier === tier).map((x) => {
              const st = typeStat(stats, x.id);
              return (
                <div key={x.id} className="cfg-row mtype-row">
                  <label className="mtype-name"><input type="checkbox" checked={c.types[x.id]?.on !== false}
                    onChange={(e) => setType(x.id, { on: e.target.checked })} />
                    <span>{t(x.label)}{st && <small className="muted mtype-stat">{t('{p}% completam ({n} vezes)', { p: st.pct, n: st.shown })}</small>}</span></label>
                  <select value={c.types[x.id]?.w ?? 1} disabled={c.types[x.id]?.on === false} onChange={(e) => setType(x.id, { w: Number(e.target.value) })}>
                    {[0.5, 1, 2, 3].map((w) => <option key={w} value={w}>{t('peso {w}', { w })}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Events c={c} set={set} />

      <div className="card">
        <h3>{t('Pontuação')}</h3>
        {Box({ k: 'points', label: t('Dar pontos por missão completa') })}
        {c.points === false && <p className="muted tiny">{t('Desligado: ninguém ganha pontos e o total some do app. Os pontos já ganhos ficam guardados e voltam se você ligar de novo.')}</p>}
        {c.points !== false && <>
          {[['easy', 'Missão fácil'], ['medium', 'Missão média'], ['hard', 'Desafio'], ['bonus', 'Bônus'], ['week', 'Semana completa (extra)']].map(([k, label]) => (
            <div key={k} className="cfg-row"><span>{t(label)}</span>
              <input type="number" min={0} max={500} value={c.points_by[k] ?? ''} onChange={(e) => set({ points_by: { ...c.points_by, [k]: Math.max(0, Math.min(500, num(e.target.value, 0))) } })} /></div>
          ))}
          <p className="muted tiny">{t('Os pontos de cada semana são recalculados com estes valores enquanto a semana está aberta.')}</p>
        </>}
      </div>

      <div className="card">
        <h3>{t('Recompensas (selos)')}</h3>
        {Box({ k: 'badges', label: t('Dar selos por semanas completas e por sequência') })}
        {c.badges === false && <p className="muted tiny">{t('Desligado: ninguém ganha selo novo e os já ganhos ficam guardados, mas não aparecem no app.')}</p>}
        {c.badges !== false && <><BadgeMarks label={t('Semanas completas')} marksKey="week_marks" namesKey="week_names" c={c} set={set} />
        <BadgeMarks label={t('Sequência de semanas jogadas')} marksKey="streak_marks" namesKey="streak_names" c={c} set={set} /></>}
      </div>

      {err && <div className="form-err">{err}</div>}
      <div className="bm-row sticky-save"><button className="btn" onClick={save}>{t('Salvar')}</button>{saved && <span className="muted small ic-row"><Check size={14} /> {t('Salvo')}</span>}</div>

      <Stats stats={stats} />
    </div>
  );
}

function typeStat(stats, id) {
  const rows = (stats?.types || []).filter((r) => r.type === id);
  const shown = rows.reduce((s, r) => s + Number(r.shown), 0);
  if (!shown) return null;
  const done = rows.reduce((s, r) => s + Number(r.done), 0);
  return { shown, pct: Math.round((done / shown) * 100) };
}

function BadgeMarks({ label, marksKey, namesKey, c, set }) {
  const [text, setText] = useState((c[marksKey] || []).join(', '));
  const names = c[namesKey] || {};
  return (
    <div className="bmarks">
      <h4 className="cfg-sub">{label}</h4>
      <div className="cfg-row"><span>{t('Marcos (separados por vírgula)')}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { const m = marks(text); set({ [marksKey]: m }); setText(m.join(', ')); }} /></div>
      {(c[marksKey] || []).map((m) => (
        <div key={m} className="cfg-row"><span>{t('Nome do selo de {n}', { n: m })}</span>
          <input maxLength={40} placeholder={t('nome padrão')} value={names[m] || ''} onChange={(e) => set({ [namesKey]: { ...names, [m]: e.target.value } })} /></div>
      ))}
    </div>
  );
}

function Events({ c, set }) {
  const { data } = useData();
  const list = c.events || [];
  const upd = (i, patch) => set({ events: list.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const add = () => set({ events: [...list, { id: newId(), title: '', kind: 'new_songs', measure: 'plays', goal: 3, start: '', end: '', songs: [], on: true }] });
  return (
    <div className="card">
      <h3>{t('Eventos')}</h3>
      <p className="muted tiny">{t('Um evento vira uma missão bônus para todo mundo no período: jogar ou passar charts das músicas escolhidas (ou das músicas novas da Phoenix 2).')}</p>
      {list.map((e, i) => <EventForm key={e.id || i} e={e} data={data} onChange={(p) => upd(i, p)} onRemove={() => set({ events: list.filter((_, j) => j !== i) })} />)}
      <button className="btn ghost" onClick={add}><Plus size={14} /> {t('Novo evento')}</button>
    </div>
  );
}

function EventForm({ e, data, onChange, onRemove }) {
  const [q, setQ] = useState('');
  const found = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    return data.songs.filter((s) => s.title.toLowerCase().includes(n) && !(e.songs || []).includes(s.id)).slice(0, 6);
  }, [q, data, e.songs]);
  const songs = (e.songs || []).map((id) => data.songs.find((s) => s.id === id)).filter(Boolean);
  return (
    <div className="ev-form">
      <div className="cfg-row"><span>{t('Título')}</span><input maxLength={40} value={e.title || ''} onChange={(x) => onChange({ title: x.target.value })} placeholder={t('Ex.: Semana do CBPIU')} /></div>
      <div className="cfg-row"><span>{t('Começa')}</span><input type="date" value={(e.start || '').slice(0, 10)} onChange={(x) => onChange({ start: x.target.value ? `${x.target.value}T00:00:00-03:00` : '' })} /></div>
      <div className="cfg-row"><span>{t('Termina (inclusive)')}</span><input type="date" value={e.end ? new Date(Date.parse(e.end) - 1000).toISOString().slice(0, 10) : ''}
        onChange={(x) => onChange({ end: x.target.value ? new Date(Date.parse(`${x.target.value}T00:00:00-03:00`) + 86400000).toISOString() : '' })} /></div>
      <div className="cfg-row"><span>{t('Músicas')}</span>
        <select value={e.kind || 'songs'} onChange={(x) => onChange({ kind: x.target.value })}>
          <option value="new_songs">{t('Músicas novas da Phoenix 2')}</option>
          <option value="songs">{t('Escolher músicas')}</option>
        </select></div>
      {e.kind === 'songs' && (
        <div className="ev-songs">
          {songs.map((s) => <span key={s.id} className="chip on">{s.title} <button className="link" aria-label={t('Tirar')} onClick={() => onChange({ songs: e.songs.filter((x) => x !== s.id) })}>×</button></span>)}
          <input placeholder={t('Buscar música…')} value={q} onChange={(x) => setQ(x.target.value)} />
          {found.map((s) => <button key={s.id} className="chip" onClick={() => { onChange({ songs: [...(e.songs || []), s.id] }); setQ(''); }}>+ {s.title}</button>)}
        </div>
      )}
      <div className="cfg-row"><span>{t('Meta')}</span>
        <span className="ev-goal"><input type="number" min={1} max={50} value={e.goal ?? 3} onChange={(x) => onChange({ goal: Math.max(1, Math.min(50, Number(x.target.value) || 1)) })} />
          <select value={e.measure || 'plays'} onChange={(x) => onChange({ measure: x.target.value })}>
            <option value="plays">{t('jogadas')}</option><option value="clears">{t('charts passados')}</option>
          </select></span></div>
      <div className="bm-row">
        <label className="ic-row small"><input type="checkbox" checked={e.on !== false} onChange={(x) => onChange({ on: x.target.checked })} /> {t('Ativo')}</label>
        <button className="link muted ic-row small" onClick={onRemove}><Trash2 size={14} /> {t('Excluir evento')}</button>
      </div>
    </div>
  );
}

function Stats({ stats }) {
  if (!stats) return null;
  const weeks = stats.weeks || [];
  return (
    <div className="card">
      <h3>{t('Como as missões estão indo')}</h3>
      {!weeks.length && <p className="muted small">{t('Ainda sem semanas registradas. Os números aparecem depois que as pessoas abrirem o app nesta semana.')}</p>}
      {weeks.length > 0 && (
        <table className="mstats">
          <thead><tr><th>{t('Semana')}</th><th>{t('Pessoas')}</th><th>{t('Completas')}</th><th>{t('Média')}</th><th>{t('Trocas')}</th><th>{t('Foco')}</th></tr></thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td>{w.week.slice(8, 10)}/{w.week.slice(5, 7)}</td><td>{w.users}</td>
                <td>{w.completed} ({w.users ? Math.round((w.completed / w.users) * 100) : 0}%)</td>
                <td>{w.avg_pct ?? 0}%</td><td>{w.rerolls}</td>
                <td className="tiny">{Object.entries(w.focus || {}).filter(([f]) => f !== 'auto').map(([f, n]) => `${t(FOCUS_LABEL[f] || f)} ${n}`).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(stats.types || []).length > 0 && <>
        <h4 className="cfg-sub">{t('Por tipo (semanas encerradas)')}</h4>
        <table className="mstats">
          <thead><tr><th>{t('Tipo')}</th><th>{t('Nível')}</th><th>{t('Vezes')}</th><th>{t('Completam')}</th></tr></thead>
          <tbody>
            {stats.types.map((r) => {
              const x = MISSION_TYPES.find((m) => m.id === r.type);
              const pct = r.shown ? Math.round((r.done / r.shown) * 100) : 0;
              return (
                <tr key={`${r.type}${r.tier}`} className={pct < 25 ? 'warn' : pct > 85 ? 'easy' : ''}>
                  <td>{t(x?.label || r.type)}</td><td>{t(TIER_LABEL[r.tier] || r.tier)}</td><td>{r.shown}</td><td>{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted tiny">{t('Abaixo de 25%: talvez difícil demais (diminua o peso ou a puxada). Acima de 85%: fácil demais.')}</p>
      </>}
      {stats.badges && Object.keys(stats.badges).length > 0 && (
        <p className="muted small">{t('Selos entregues')}: {Object.entries(stats.badges).map(([k, n]) => `${k.replace('weeks:', t('semanas') + ' ').replace('streak:', t('sequência') + ' ')} (${n})`).join(' · ')}</p>
      )}
    </div>
  );
}

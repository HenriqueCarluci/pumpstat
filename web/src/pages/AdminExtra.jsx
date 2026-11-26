// Administração: desafios do mês e liga/desliga geral de recursos.
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { ALWAYS_FREE, FEATURE_DEFAULTS, FEATURES, LIMITS, PLAN_LABEL, PLAN_ORDER, rank, TOGGLES } from '../lib/plans.js';
import { CHALLENGE_KINDS, goalText, PRIZE_MODES, prizeText, TEMPLATES } from '../lib/challenges.js';
import { locale, t, tErr, tn } from '../lib/i18n.js';
import { Check, Gift, Minus, Trophy } from '../components/Icons.jsx';

// ---------- liga/desliga ----------
export function FeatureToggles() {
  const { reloadPlan } = useData();
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { rpc('app_config').then(setCfg).catch((e) => setErr(tErr(e.message))); }, []);
  if (!cfg) return <p className="empty">{err || t('Carregando…')}</p>;
  const on = (id) => cfg.toggles?.[id] !== false;
  const flip = (id) => { setSaved(false); setCfg((c) => ({ ...c, toggles: { ...(c.toggles || {}), [id]: !on(id) } })); };
  const save = async () => {
    setErr('');
    try { await rpc('admin_set_config', { p_value: cfg }); setSaved(true); reloadPlan(); } catch (e) { setErr(tErr(e.message)); }
  };
  const groups = [...new Set(TOGGLES.map((x) => x.group))];
  return (
    <div className="plans-config">
      <p className="muted small">{t('Desligue um recurso para escondê-lo de todo mundo (administradores também) até você ligar de novo. Nada é apagado.')}</p>
      {groups.map((g) => (
        <div key={g}>
          <h3>{t(g)}</h3>
          {TOGGLES.filter((x) => x.group === g).map((x) => (
            <label key={x.id} className="check toggle-row">
              <input type="checkbox" checked={on(x.id)} onChange={() => flip(x.id)} />
              <span><b>{t(x.label)}</b> <small className={on(x.id) ? 'up' : 'muted'}>{on(x.id) ? t('ligado') : t('desligado')}</small></span>
            </label>
          ))}
        </div>
      ))}
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" onClick={save}>{t('Salvar')}</button>
        {saved && <span className="small ic-row"><Check size={14} /> {t('Salvo.')}</span>}
      </div>
    </div>
  );
}

// ---------- desafios ----------
const monthRange = (offset = 0) => {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + offset);
  const end = new Date(d); end.setMonth(end.getMonth() + 1);
  return [d, end];
};
const toInput = (d) => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fromInput = (s, endOfDay) => new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString();
const fmtD = (s) => new Date(s).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' });
const GRADES = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA+', 'AAA', 'AA+', 'AA', 'A+', 'A'];

function emptyForm() {
  const [a, b] = monthRange(0);
  return { title: '', description: '', kind: 'days', goal: 8, song_id: '', min_grade: 'S', start: toInput(a), end: toInput(new Date(b.getTime() - 86400000)),
    prize: '', prize_mode: 'raffle', winners: 1, active: true };
}

export function ChallengesAdmin() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null);
  const load = () => rpc('admin_challenges').then(setList).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);

  const edit = (c) => setForm({
    id: c.id, title: c.title, description: c.description || '', kind: c.kind, goal: c.goal, song_id: c.song || '', song_title: c.song_title,
    min_grade: c.min_grade || 'S', start: toInput(c.starts_at), end: toInput(new Date(Date.parse(c.ends_at) - 1000)),
    prize: c.prize || '', prize_mode: c.prize_mode, winners: c.winners, active: c.active,
  });

  return (
    <div className="ch-admin">
      <p className="muted small">{t('Desafios medem esforço (dias jogados, recordes pessoais, charts novos), não nível: qualquer pessoa pode completar. Prefira sorteio entre quem completou ou brinde para todos.')}</p>
      {!form && <button className="btn" onClick={() => setForm(emptyForm())}><Trophy size={15} /> {t('Novo desafio')}</button>}
      {form && <ChallengeForm form={form} setForm={setForm} onSaved={() => { setForm(null); load(); }} />}
      {err && <div className="form-err">{err}</div>}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}
      {list && !list.length && !form && <p className="muted small">{t('Nenhum desafio cadastrado ainda.')}</p>}
      {list?.map((c) => <AdminChallenge key={c.id} c={c} onEdit={() => edit(c)} onChange={load} />)}
    </div>
  );
}

function ChallengeForm({ form, setForm, onSaved }) {
  const { data } = useData();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const songs = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    return data.songs.filter((s) => s.title.toLowerCase().includes(n)).slice(0, 8);
  }, [q, data]);
  const kind = CHALLENGE_KINDS.find((k) => k.id === form.kind);

  const save = async () => {
    setErr('');
    if (form.title.trim().length < 3) { setErr(t('Dê um nome ao desafio.')); return; }
    if (form.kind === 'song' && !form.song_id) { setErr(t('Escolha a música do desafio.')); return; }
    if (form.end < form.start) { setErr(t('A data final precisa ser depois da inicial.')); return; }
    setBusy(true);
    try {
      await rpc('admin_save_challenge', { p: {
        id: form.id || null, title: form.title, description: form.description, kind: form.kind, goal: Number(form.goal) || 1,
        song_id: form.song_id || null, min_grade: form.min_grade, starts_at: fromInput(form.start), ends_at: fromInput(form.end, true),
        prize: form.prize, prize_mode: form.prize_mode, winners: Number(form.winners) || 1, active: form.active,
      } });
      onSaved();
    } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };

  return (
    <section className="card ch-form">
      <h3>{form.id ? t('Editar desafio') : t('Novo desafio')}</h3>
      {!form.id && (
        <div className="ch-templates">
          <small className="muted">{t('Modelos prontos')}:</small>
          {TEMPLATES.map((tp) => (
            <button key={tp.title} className="chip-toggle" onClick={() => set({ ...tp, title: t(tp.title), description: t(tp.description) })}>{t(tp.title)}</button>
          ))}
        </div>
      )}
      <label>{t('Nome')}<input value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} /></label>
      <label>{t('Descrição')}<textarea rows={2} maxLength={600} value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <div className="ch-form-row">
        <label>{t('Tipo')}
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            {CHALLENGE_KINDS.map((k) => <option key={k.id} value={k.id}>{t(k.label)}</option>)}
          </select>
        </label>
        <label>{t('Meta')}<input type="number" min="1" max="1000" value={form.goal} onChange={(e) => set({ goal: e.target.value })} /></label>
        {form.kind === 'grade' && (
          <label>{t('Nota mínima')}
            <select value={form.min_grade} onChange={(e) => set({ min_grade: e.target.value })}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
          </label>
        )}
      </div>
      {kind && <p className="muted small">{t(kind.hint)}</p>}
      {form.kind === 'song' && (
        <div>
          {form.song_id ? (
            <p className="small">{t('Música')}: <b>{form.song_title}</b> <button className="link small" onClick={() => set({ song_id: '', song_title: '' })}>{t('Trocar')}</button></p>
          ) : (
            <>
              <input placeholder={t('Buscar música…')} value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="ch-song-list">
                {songs.map((s) => <button key={s.id} className="chip-toggle" onClick={() => { set({ song_id: s.id, song_title: s.title }); setQ(''); }}>{s.title}</button>)}
              </div>
            </>
          )}
        </div>
      )}
      <div className="ch-form-row">
        <label>{t('Começa')}<input type="date" value={form.start} onChange={(e) => set({ start: e.target.value })} /></label>
        <label>{t('Termina')}<input type="date" value={form.end} onChange={(e) => set({ end: e.target.value })} /></label>
      </div>
      <label>{t('Prêmio ou brinde')}<input value={form.prize} maxLength={300} placeholder={t('Ex.: 10 fichas, camiseta do clube, adesivo')} onChange={(e) => set({ prize: e.target.value })} /></label>
      <div className="ch-form-row">
        <label>{t('Como premiar')}
          <select value={form.prize_mode} onChange={(e) => set({ prize_mode: e.target.value })}>
            {PRIZE_MODES.map((m) => <option key={m.id} value={m.id}>{t(m.label)}</option>)}
          </select>
        </label>
        {form.prize_mode !== 'all' && <label>{t('Quantos ganham')}<input type="number" min="1" max="100" value={form.winners} onChange={(e) => set({ winners: e.target.value })} /></label>}
      </div>
      {form.prize_mode === 'top' && <p className="muted small">{t('Atenção: ranking dos primeiros favorece quem joga mais. Para ser igualitário, prefira sorteio entre quem completar.')}</p>}
      <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> <span>{t('Visível para os membros')}</span></label>
      <p className="small muted">{t('Prévia')}: <b>{goalText({ ...form, song_title: form.song_title })}</b> · {prizeText({ ...form, winners: Number(form.winners) || 1 })}</p>
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" disabled={busy} onClick={save}>{t('Salvar')}</button>
        <button className="link muted" onClick={() => setForm(null)}>{t('Cancelar')}</button>
      </div>
      {!form.id && <p className="muted small">{t('Ao salvar um desafio visível, todos os membros recebem uma notificação.')}</p>}
    </section>
  );
}

function AdminChallenge({ c, onEdit, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const draw = async () => {
    const msg = c.winner_list?.length ? t('Refazer a premiação? Os ganhadores atuais serão trocados.') : t('Premiar agora com o progresso atual?');
    if (!window.confirm(msg)) return;
    setBusy(true); setErr('');
    try { await rpc('admin_draw_challenge', { p_id: c.id }); onChange(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const mark = async (w) => {
    try { await rpc('admin_mark_prize', { p_id: c.id, p_user: w.id, p_delivered: !w.delivered }); onChange(); } catch (e) { setErr(tErr(e.message)); }
  };
  return (
    <section className={`card challenge ${c.status} ${c.active ? '' : 'inactive'}`}>
      <div className="row-between">
        <h3>{c.title}{!c.active && <small className="muted"> · {t('oculto')}</small>}</h3>
        <span className={`tag ch-status ${c.status}`}>{c.status === 'soon' ? t('Agendado') : c.status === 'live' ? t('Em andamento') : t('Encerrado')}</span>
      </div>
      <p className="small"><b>{goalText(c)}</b> · {fmtD(c.starts_at)}–{fmtD(new Date(Date.parse(c.ends_at) - 1000))}</p>
      {c.prize && <p className="small ic-row"><Gift size={14} /> {c.prize} · <span className="muted">{prizeText(c)}</span></p>}
      <p className="small muted">{tn(c.participants, '{n} participante', '{n} participantes')} · {tn(c.completed, '{n} completou', '{n} completaram')}</p>
      {c.winner_list?.length > 0 && (
        <div className="ch-winners">
          <b className="small">{t('Ganhadores')}</b>
          {c.winner_list.map((w) => (
            <div key={w.id} className="small ch-winner">
              <span>{w.place ? `${w.place}º ` : ''}{w.nickname || t('Jogador')} <span className="muted">({w.progress}/{c.goal}{w.email ? ` · ${w.email}` : ''})</span></span>
              <label className="check"><input type="checkbox" checked={!!w.delivered} onChange={() => mark(w)} /> {t('entregue')}</label>
            </div>
          ))}
        </div>
      )}
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn ghost" onClick={onEdit}>{t('Editar')}</button>
        <button className="btn" disabled={busy} onClick={draw}>{c.winner_list?.length ? t('Refazer premiação') : c.prize_mode === 'raffle' ? t('Sortear') : t('Premiar')}</button>
      </div>
      {c.status !== 'ended' && <p className="muted small">{t('O ideal é premiar depois do fim, para todo mundo ter o prazo inteiro.')}</p>}
    </section>
  );
}

/**
 * Matriz de recursos por plano. Cada recurso vale "a partir de" um plano (o servidor confere assim):
 * marcar o Plus marca o Pro também; tocar no menor plano marcado tira esse plano.
 * Os limites (amigos, recomendações, histórico) ficam nas últimas linhas; em branco = sem limite.
 */
export function PlanMatrix({ cfg, set }) {
  const need = (id) => cfg.features?.[id] || FEATURE_DEFAULTS[id] || 'free';
  const groups = [...new Set(FEATURES.map((f) => f.group))];
  const click = (id, p) => set((c) => {
    const cur = c.features?.[id] || FEATURE_DEFAULTS[id] || 'free';
    let next = p;
    // tocou no menor plano já marcado: sobe um plano (o Pro fica sempre marcado)
    if (p === cur) next = PLAN_ORDER[Math.min(PLAN_ORDER.length - 1, rank(p) + 1)];
    c.features = { ...(c.features || {}), [id]: next };
  });
  const lim = (p, k) => cfg.limits?.[p]?.[k] ?? '';
  const setLim = (p, k, v) => set((c) => {
    c.limits = c.limits || {}; c.limits[p] = { ...(c.limits[p] || {}) };
    if (v === '') delete c.limits[p][k]; else c.limits[p][k] = Math.max(0, Number(v));
  });
  const head = (p) => (p === 'free' ? t('Grátis') : PLAN_LABEL[p]);
  return (
    <div className="pm-wrap">
      <table className="plan-matrix">
        <thead><tr><th>{t('Recurso')}</th>{PLAN_ORDER.map((p) => <th key={p}>{head(p)}</th>)}</tr></thead>
        <tbody>
          {groups.map((g) => (
            <FragmentRows key={g}>
              <tr className="pm-group"><td colSpan={PLAN_ORDER.length + 1}>{t(g)}</td></tr>
              {FEATURES.filter((f) => f.group === g).map((f) => (
                <tr key={f.id}>
                  <td>{t(f.label)}{f.soon && <em className="soon"> · {t('em breve')}</em>}</td>
                  {PLAN_ORDER.map((p) => {
                    const on = rank(p) >= rank(need(f.id));
                    return (
                      <td key={p} className="pm-cell">
                        <button type="button" className={`pm-toggle ${on ? 'on' : ''}`} onClick={() => click(f.id, p)}
                          aria-pressed={on} aria-label={`${t(f.label)}: ${head(p)}`}>
                          {on ? <Check size={15} /> : <Minus size={15} />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </FragmentRows>
          ))}
          <tr className="pm-group"><td colSpan={PLAN_ORDER.length + 1}>{t('Limites (em branco = sem limite)')}</td></tr>
          {LIMITS.map((l) => (
            <tr key={l.id}>
              <td>{t(l.label)}</td>
              {PLAN_ORDER.map((p) => (
                <td key={p} className="pm-cell">
                  <input type="number" min="0" inputMode="numeric" value={lim(p, l.id)} placeholder="∞" aria-label={`${t(l.label)}: ${head(p)}`}
                    onChange={(e) => setLim(p, l.id, e.target.value)} />
                </td>
              ))}
            </tr>
          ))}
          <tr className="pm-group"><td colSpan={PLAN_ORDER.length + 1}>{t('Sempre grátis')}</td></tr>
          <tr><td colSpan={PLAN_ORDER.length + 1} className="muted small">{ALWAYS_FREE.map((x) => t(x)).join(' · ')}</td></tr>
        </tbody>
      </table>
      <p className="muted small">{t('Toque numa coluna para o recurso valer a partir daquele plano. Tocar de novo no menor plano marcado tira esse plano. Salve no fim da página.')}</p>
    </div>
  );
}
const FragmentRows = ({ children }) => children;

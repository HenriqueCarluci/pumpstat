import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { TIER_VOTES } from '../lib/piu.js';
import { Grade, timeAgo } from './ui.jsx';

export const REVIEW_TAGS = [
  ['twist', 'Twist'], ['drill', 'Drill'], ['run', 'Corrida'], ['bracket', 'Bracket'], ['jump', 'Pulo'],
  ['jack', 'Jack'], ['doublestep', 'Doublestep'], ['footswitch', 'Footswitch'], ['gimmick', 'Gimmick'],
  ['stamina', 'Stamina'], ['hold', 'Hold'], ['tecnico', 'Técnico'],
];
const TAG_LABEL = Object.fromEntries(REVIEW_TAGS);
const tierLabel = (v) => TIER_VOTES.find(([n]) => n === v)?.[1];
const avgLabel = (a) => (a == null ? null : a >= 1.5 ? 'Topo do nível' : a >= 0.5 ? 'Difícil' : a > -0.5 ? 'Médio' : a > -1.5 ? 'Fácil' : 'Muito fácil');

/** Avaliações da comunidade de um chart: voto de tier, tags de estilo e comentários. */
export default function ChartReviews({ chart, onSaved }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ tier: null, tags: [], comment: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const r = await rpc('chart_reviews_for', { p_chart: chart.id });
      setInfo(r);
      if (r.mine) setForm({ tier: r.mine.tier, tags: r.mine.tags || [], comment: r.mine.comment || '' });
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [chart.id]); // eslint-disable-line

  const toggleTag = (t) => setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  const save = async (clear = false) => {
    setBusy(true); setErr(''); setSaved(false);
    try {
      const body = clear ? { tier: null, tags: [], comment: '' } : form;
      await rpc('review_chart', { p_chart: chart.id, p_tier: body.tier, p_tags: body.tags, p_comment: body.comment });
      if (clear) setForm(body);
      await load();
      setSaved(true);
      onSaved?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!info) return <p className="muted small">{err || 'Carregando avaliações…'}</p>;
  return (
    <div className="reviews">
      <div className="rv-summary">
        {info.votes > 0
          ? <span>Comunidade: <b>{avgLabel(Number(info.avg))}</b> <span className="muted small">({info.votes} {info.votes === 1 ? 'voto' : 'votos'})</span></span>
          : <span className="muted small">Ninguém votou no tier deste chart ainda.</span>}
        {info.tags.length > 0 && (
          <span className="rv-tags">{info.tags.map(([t, n]) => <span key={t} className="tag skill">{TAG_LABEL[t] || t} · {n}</span>)}</span>
        )}
      </div>

      {info.can_review ? (
        <div className="rv-form">
          <div className="rv-label">Para você, este chart é…</div>
          <div className="chips">
            {TIER_VOTES.map(([v, l]) => (
              <button key={v} type="button" className={form.tier === v ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, tier: f.tier === v ? null : v }))}>{l}</button>
            ))}
          </div>
          <div className="rv-label">O que mais pesa nele?</div>
          <div className="chips">
            {REVIEW_TAGS.map(([t, l]) => <button key={t} type="button" className={form.tags.includes(t) ? 'on' : ''} onClick={() => toggleTag(t)}>{l}</button>)}
          </div>
          <textarea maxLength={500} rows={2} placeholder="Comentário (opcional): dica, parte difícil, como passar…" value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
          <div className="rv-actions">
            <button className="btn" disabled={busy} onClick={() => save(false)}>{info.mine ? 'Atualizar avaliação' : 'Enviar avaliação'}</button>
            {info.mine && <button className="btn ghost" disabled={busy} onClick={() => save(true)}>Remover</button>}
            {saved && <span className="muted small">Salvo ✓</span>}
          </div>
        </div>
      ) : (
        <p className="muted small">Passe este chart (sem stage break) e sincronize para poder votar no tier, marcar o estilo e comentar.</p>
      )}
      {err && <div className="form-err">{err}</div>}

      {info.comments.length > 0 && (
        <div className="rv-comments">
          {info.comments.map((c, i) => (
            <div key={i} className="rv-c">
              <span className="q-avatar" style={{ width: 32, height: 32 }}>{c.avatar ? <img src={c.avatar} alt="" referrerPolicy="no-referrer" /> : (c.nickname || '?').slice(0, 2)}</span>
              <div>
                <div className="rv-c-head">
                  {c.me ? <b>Você</b> : <Link to={`/jogador/${c.user}`}><b>{c.nickname || 'Jogador'}</b></Link>}
                  {c.grade && <Grade grade={c.grade} size="sm" />}
                  {c.tier != null && <span className="tag">{tierLabel(c.tier)}</span>}
                  <span className="muted small">{timeAgo(c.at)}</span>
                </div>
                <div className="rv-c-text">{c.comment}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

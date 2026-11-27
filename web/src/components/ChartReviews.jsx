import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { TIER_VOTES } from '../lib/piu.js';
import { Grade, timeAgo } from './ui.jsx';
import { t, tErr, tn } from '../lib/i18n.js';
import { canAdmin } from '../lib/admin.js';
import { Check } from './Icons.jsx';
import ReportBlock from './ReportBlock.jsx';
import { ShieldCheck } from './Icons.jsx';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import TierVote from './TierVote.jsx';

export const REVIEW_TAGS = [
  ['twist', 'Twist'], ['drill', 'Drill'], ['run', 'Corrida'], ['bracket', 'Bracket'], ['jump', 'Pulo'],
  ['jack', 'Jack'], ['doublestep', 'Doublestep'], ['footswitch', 'Footswitch'], ['gimmick', 'Gimmick'],
  ['stamina', 'Stamina'], ['hold', 'Hold'], ['tecnico', 'Técnico'], ['offcurve', 'Fora da curva'],
];
/** Tipos de gimmick (aparecem quando a pessoa marca "Gimmick"). */
export const GIMMICK_TAGS = [
  ['g_speed', 'Mudança de velocidade'], ['g_stop', 'Paradas'], ['g_fake', 'Setas falsas'], ['g_warp', 'Warp (pulo no tempo)'],
  ['g_visual', 'Efeito visual (setas somem ou piscam)'],
];
const TAG_LABEL = Object.fromEntries([...REVIEW_TAGS, ...GIMMICK_TAGS]);
export const reviewTagLabel = (x) => TAG_LABEL[x] || x;
const tierLabel = (v) => t(TIER_VOTES.find(([n]) => n === v)?.[1] || '');
const avgLabel = (a) => (a == null ? null : t(a >= 1.5 ? 'Topo do nível' : a >= 0.5 ? 'Difícil' : a > -0.5 ? 'Médio' : a > -1.5 ? 'Fácil' : 'Muito fácil'));

/** Avaliações da comunidade de um chart: voto de tier, tags de estilo e comentários. */
export default function ChartReviews({ chart, onSaved }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ tier: null, tags: [], comment: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const { plan } = useData();
  const setClub = async (v) => {
    try { await rpc('admin_set_chart_tier', { p_chart: chart.id, p_tier: v }); await load(); onSaved?.(); } catch (e) { setErr(tErr(e.message)); }
  };
  const load = async () => {
    try {
      const r = await rpc('chart_reviews_for', { p_chart: chart.id });
      setInfo(r);
      if (r.mine) setForm({ tier: r.mine.tier, tags: r.mine.tags || [], comment: r.mine.comment || '' });
    } catch (e) { setErr(tErr(e.message)); }
  };
  useEffect(() => { load(); }, [chart.id]); // eslint-disable-line

  const toggleTag = (tag) => setForm((f) => {
    const off = f.tags.includes(tag);
    let tags = off ? f.tags.filter((x) => x !== tag) : [...f.tags, tag];
    if (off && tag === 'gimmick') tags = tags.filter((x) => !x.startsWith('g_'));
    return { ...f, tags };
  });
  const save = async (clear = false) => {
    setBusy(true); setErr(''); setSaved(false);
    try {
      const body = clear ? { tier: null, tags: [], comment: '' } : form;
      await rpc('review_chart', { p_chart: chart.id, p_tier: body.tier, p_tags: body.tags, p_comment: body.comment });
      if (clear) setForm(body);
      await load();
      setSaved(true);
      onSaved?.();
    } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };

  if (!info) return <p className="muted small">{err || t('Carregando avaliações…')}</p>;
  return (
    <div className="reviews">
      {canAdmin(plan, 'charts') && (
        <div className="club-tier">
          <div className="rv-label ic-row"><ShieldCheck size={13} /> {t('Tier do clube (admin): vale acima dos votos e do PIU Scores')}</div>
          <div className="chips">
            {TIER_VOTES.map(([v, l]) => (
              <button key={v} className={info.club_tier === v ? 'on' : ''} onClick={() => setClub(info.club_tier === v ? null : v)}>{t(l)}</button>
            ))}
          </div>
        </div>
      )}
      {info.club_tier != null && !canAdmin(plan, 'charts') && <div className="tag club-tag">{t('Tier do clube')}: {tierLabel(info.club_tier)}</div>}
      {isOn(plan, 'tier_votes') && <TierVote chart={chart} canPropose={info.can_review} clubTier={info.club_tier} onChange={() => { load(); onSaved?.(); }} />}
      <div className="rv-summary">
        {info.votes > 0
          ? <span>{t('Comunidade:')} <b>{avgLabel(Number(info.avg))}</b> <span className="muted small">({tn(info.votes, '{n} voto', '{n} votos')})</span></span>
          : <span className="muted small">{t('Ninguém votou no tier deste chart ainda.')}</span>}
        {info.tags.length > 0 && (
          <span className="rv-tags">{info.tags.map(([x, n]) => <span key={x} className="tag skill">{t(TAG_LABEL[x] || x)} · {n}</span>)}</span>
        )}
      </div>

      {info.can_review ? (
        <div className="rv-form">
          <div className="rv-label">{t('Para você, este chart é…')}</div>
          <div className="chips">
            {TIER_VOTES.map(([v, l]) => (
              <button key={v} type="button" className={form.tier === v ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, tier: f.tier === v ? null : v }))}>{t(l)}</button>
            ))}
          </div>
          <div className="rv-label">{t('O que mais pesa nele?')}</div>
          <div className="chips">
            {REVIEW_TAGS.map(([x, l]) => <button key={x} type="button" className={form.tags.includes(x) ? 'on' : ''} onClick={() => toggleTag(x)}>{t(l)}</button>)}
          </div>
          {form.tags.includes('gimmick') && (
            <div className="chips gimmick-types">
              <small className="muted">{t('Qual gimmick?')}</small>
              {GIMMICK_TAGS.map(([x, l]) => <button key={x} type="button" className={form.tags.includes(x) ? 'on' : ''} onClick={() => toggleTag(x)}>{t(l)}</button>)}
            </div>
          )}
          <textarea maxLength={500} rows={2} placeholder={t('Comentário (opcional): dica, parte difícil, como passar…')} value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
          <div className="rv-actions">
            <button className="btn" disabled={busy} onClick={() => save(false)}>{info.mine ? t('Atualizar avaliação') : t('Enviar avaliação')}</button>
            {info.mine && <button className="btn ghost" disabled={busy} onClick={() => save(true)}>{t('Remover')}</button>}
            {saved && <span className="muted small">{t('Salvo')} <Check size={14} /></span>}
          </div>
        </div>
      ) : (
        <p className="muted small">{t('Passe este chart (sem stage break) e sincronize para poder votar no tier, marcar o estilo e comentar.')}</p>
      )}
      {err && <div className="form-err">{err}</div>}

      {info.comments.length > 0 && (
        <div className="rv-comments">
          {info.comments.map((c, i) => (
            <div key={i} className="rv-c">
              <span className="q-avatar" style={{ width: 32, height: 32 }}>{c.avatar ? <img src={c.avatar} alt="" referrerPolicy="no-referrer" /> : (c.nickname || '?').slice(0, 2)}</span>
              <div>
                <div className="rv-c-head">
                  {c.me ? <b>{t('Você')}</b> : <Link to={`/jogador/${c.user}`}><b>{c.nickname || t('Jogador')}</b></Link>}
                  {c.grade && <Grade grade={c.grade} size="sm" />}
                  {c.tier != null && <span className="tag">{tierLabel(c.tier)}</span>}
                  <span className="muted small">{timeAgo(c.at)}</span>
                </div>
                <div className="rv-c-text">{c.comment}</div>
                {!c.me && <ReportBlock compact user={c.user} name={c.nickname} context={{ where: 'comentário', chart: chart.id, comment: c.comment }} onBlocked={load} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

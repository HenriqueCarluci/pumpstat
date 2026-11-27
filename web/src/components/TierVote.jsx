import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { chartTier, TIER_NUM, TIER_VOTES } from '../lib/piu.js';
import { t, tErr, tn } from '../lib/i18n.js';
import { canAdmin } from '../lib/admin.js';
import { useData } from '../App.jsx';
import { Ball, Jacket } from './ui.jsx';
import { Check, Clock, ShieldCheck, ThumbsDown, ThumbsUp, Vote } from './Icons.jsx';

export const tierName = (v) => t((TIER_VOTES.find(([n]) => n === Number(v)) || [, '?'])[1]);
const hoursLeft = (iso) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 3600000));

/** Uma votação de tier: placar, prazo e os botões de concordo/discordo. */
export function ProposalCard({ p, onChange, showChart = false }) {
  const { plan } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const vote = async (agree) => {
    setBusy(true); setErr('');
    try { await rpc('vote_tier', { p_id: p.id, p_agree: agree }); onChange?.(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const close = async (approve) => {
    setBusy(true); setErr('');
    try { await rpc('admin_close_tier', { p_id: p.id, p_approve: approve }); onChange?.(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const total = p.yes + p.no;
  return (
    <div className={`proposal ${p.status}`}>
      {showChart && (
        <Link to={`/musica/${p.song}`} className="proposal-chart">
          <Jacket song={{ title: p.title, jacket: p.jacket }} width={56} />
          <Ball chart={{ mode: p.mode, level: p.level }} size="sm" />
          <b>{p.title}</b>
        </Link>
      )}
      <div className="proposal-head">
        <Vote size={15} />
        <span>{p.from != null ? t('{who} propõe mudar de {a} para {b}', { who: p.mine ? t('Você') : (p.proposer || t('Alguém')), a: tierName(p.from), b: tierName(p.to) })
          : t('{who} propõe o tier {b}', { who: p.mine ? t('Você') : (p.proposer || t('Alguém')), b: tierName(p.to) })}</span>
      </div>
      {p.reason && <p className="proposal-reason">“{p.reason}”</p>}
      <div className="proposal-bar"><span className="yes" style={{ width: `${total ? (p.yes / total) * 100 : 0}%` }} /></div>
      <div className="proposal-foot small">
        <span className="ic-row"><ThumbsUp size={13} /> {p.yes}</span>
        <span className="ic-row"><ThumbsDown size={13} /> {p.no}</span>
        {p.status === 'open'
          ? <span className="muted ic-row"><Clock size={13} /> {t('encerra em {h} h', { h: hoursLeft(p.closes_at) })}</span>
          : <b className={p.status === 'approved' ? 'ok' : 'muted'}>{p.status === 'approved' ? t('Aprovada') : t('Não aprovada')}</b>}
      </div>
      {p.status === 'open' && (p.can_vote ? (
        <div className="bm-row">
          <button className={`btn ${p.my_vote === true ? '' : 'ghost'}`} disabled={busy} onClick={() => vote(true)}><ThumbsUp size={14} /> {t('Concordo')}</button>
          <button className={`btn ${p.my_vote === false ? '' : 'ghost'}`} disabled={busy} onClick={() => vote(false)}><ThumbsDown size={14} /> {t('Discordo')}</button>
          {p.my_vote != null && <span className="muted small ic-row"><Check size={13} /> {t('voto registrado')}</span>}
        </div>
      ) : <p className="muted small">{t('Só quem passou este chart pode votar.')}</p>)}
      {p.status === 'open' && canAdmin(plan, 'charts') && (
        <div className="bm-row small">
          <span className="muted ic-row"><ShieldCheck size={13} /> {t('Admin:')}</span>
          <button className="link" disabled={busy} onClick={() => close(true)}>{t('Aprovar agora')}</button>
          <button className="link" disabled={busy} onClick={() => close(false)}>{t('Recusar')}</button>
        </div>
      )}
      {err && <div className="form-err">{err}</div>}
    </div>
  );
}

/** Votação de tier dentro das avaliações do chart: a votação aberta ou o botão para propor. */
export default function TierVote({ chart, canPropose, clubTier, onChange }) {
  const { config } = useData().plan || {};
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const load = () => rpc('tier_proposals_list', { p_charts: [chart.id] }).then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, [chart.id]); // eslint-disable-line
  const current = clubTier ?? TIER_NUM[chartTier(chart)] ?? null;
  const hours = config?.community?.tier_vote_hours || 48;

  const propose = async () => {
    setErr('');
    try {
      await rpc('propose_tier', { p_chart: chart.id, p_to: to, p_from: current, p_reason: reason });
      setOpen(false); setTo(null); setReason(''); await load(); onChange?.();
    } catch (e) { setErr(tErr(e.message)); }
  };
  if (!list) return null;
  const active = list.find((p) => p.status === 'open');
  const last = list.find((p) => p.status !== 'open');
  return (
    <div className="tier-vote">
      {active && <ProposalCard p={active} onChange={() => { load(); onChange?.(); }} />}
      {!active && last && <ProposalCard p={last} />}
      {!active && canPropose && !open && (
        <button className="link ic-row" onClick={() => setOpen(true)}><Vote size={14} /> {t('Propor mudança do tier do clube')}</button>
      )}
      {!active && open && (
        <div className="proposal-form">
          <div className="rv-label">{t('Hoje: {tier}. Para qual tier deveria mudar?', { tier: current != null ? tierName(current) : t('sem tier') })}</div>
          <div className="chips">
            {TIER_VOTES.filter(([v]) => v !== current).map(([v, l]) => (
              <button key={v} type="button" className={to === v ? 'on' : ''} onClick={() => setTo(v)}>{t(l)}</button>
            ))}
          </div>
          <input maxLength={300} placeholder={t('Por quê? (opcional)')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="muted tiny">{tn(hours, 'A votação fica aberta por {n} hora. Se a maioria de quem passou o chart concordar, o tier do clube muda.', 'A votação fica aberta por {n} horas. Se a maioria de quem passou o chart concordar, o tier do clube muda.')}</p>
          {err && <div className="form-err">{err}</div>}
          <div className="bm-row">
            <button className="btn" disabled={to == null} onClick={propose}>{t('Abrir votação')}</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

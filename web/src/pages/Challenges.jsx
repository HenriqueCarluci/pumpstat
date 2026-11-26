// Desafios do mês: metas para qualquer nível, com brindes do clube.
import { Flag, useCountries } from '../lib/country.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { isOn } from '../lib/plans.js';
import { goalText, prizeText } from '../lib/challenges.js';
import { locale, t, tErr, tn } from '../lib/i18n.js';
import { Check, ChevronDown, ChevronUp, Gift, Trophy, Users } from '../components/Icons.jsx';
import { Avatar } from './Players.jsx';
import { TeamTag, useTeams } from '../lib/teams.jsx';

const fmtD = (s) => new Date(s).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
const daysLeft = (s) => Math.max(0, Math.ceil((Date.parse(s) - Date.now()) / 86400000));

export default function Challenges() {
  const { plan } = useData();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const load = () => rpc('list_challenges').then(setList).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);
  if (!isOn(plan, 'challenges')) return <div className="page"><p className="empty">{t('Este recurso está desligado no momento.')}</p></div>;

  const live = (list || []).filter((c) => c.status !== 'ended');
  const ended = (list || []).filter((c) => c.status === 'ended');
  return (
    <div className="page challenges-page">
      <h2 className="ic-row"><Trophy size={20} /> {t('Desafios do mês')}</h2>
      <p className="muted small">{t('Metas que medem o seu esforço, não o seu nível: iniciante e pro disputam de igual para igual. O progresso conta sozinho quando você sincroniza.')}</p>
      {err && <div className="form-err">{err}</div>}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}
      {list && !list.length && <p className="empty">{t('Nenhum desafio no momento. Fique de olho: os próximos aparecem aqui.')}</p>}
      {live.map((c) => <ChallengeCard key={c.id} c={c} onChange={(n) => setList((l) => l.map((x) => (x.id === n.id ? { ...x, ...n } : x)))} />)}
      {ended.length > 0 && <h3>{t('Encerrados')}</h3>}
      {ended.map((c) => <ChallengeCard key={c.id} c={c} />)}
    </div>
  );
}

function ChallengeCard({ c, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [board, setBoard] = useState(null);
  const [open, setOpen] = useState(false);
  const teamOf = useTeams((board || []).map((b) => b.id));
  const ccOf = useCountries((board || []).map((b) => b.id));
  const pct = c.progress != null ? Math.min(100, (c.progress / c.goal) * 100) : 0;
  const done = c.progress != null && c.progress >= c.goal;

  const join = async (v) => {
    setBusy(true); setErr('');
    try { onChange?.(await rpc('join_challenge', { p_id: c.id, p_join: v })); if (open) loadBoard(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const loadBoard = () => rpc('challenge_board', { p_id: c.id }).then(setBoard).catch((e) => setErr(tErr(e.message)));
  const toggle = () => { if (!open && !board) loadBoard(); setOpen(!open); };

  return (
    <section className={`card challenge ${c.status} ${done ? 'done' : ''}`}>
      <div className="row-between">
        <h3>{c.title}</h3>
        <span className={`tag ch-status ${c.status}`}>
          {c.status === 'soon' ? t('Começa {d}', { d: fmtD(c.starts_at) })
            : c.status === 'live' ? tn(daysLeft(c.ends_at), 'Falta {n} dia', 'Faltam {n} dias')
              : t('Encerrado')}
        </span>
      </div>
      <p className="ch-goal"><b>{goalText(c)}</b></p>
      {c.description && <p className="small">{c.description}</p>}
      <p className="small muted">{fmtD(c.starts_at)}–{fmtD(new Date(Date.parse(c.ends_at) - 1000).toISOString())} · {tn(c.participants, '{n} participante', '{n} participantes')}</p>
      {c.prize && (
        <div className="ch-prize"><Gift size={16} /> <span><b>{c.prize}</b><br /><small className="muted">{prizeText(c)}</small></span></div>
      )}

      {c.joined && (
        <div className="ch-progress">
          <div className="row-between small"><span>{done ? <><Check size={14} /> {t('Meta cumprida!')}</> : t('Seu progresso')}</span><b>{c.progress}/{c.goal}</b></div>
          <div className="missions-bar"><span style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {c.won && <p className="ch-won"><Trophy size={16} /> {t('Você ganhou! Fale com o clube para retirar o prêmio.')}</p>}
      {c.status === 'ended' && c.winner_list?.length > 0 && (
        <p className="small"><b>{t('Ganhadores')}:</b> {c.winner_list.map((w) => w.nickname || t('Jogador')).join(', ')}</p>
      )}
      {c.status === 'ended' && !c.drawn_at && <p className="small muted">{t('Resultado em breve.')}</p>}

      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        {c.status !== 'ended' && !c.joined && <button className="btn" disabled={busy} onClick={() => join(true)}>{t('Participar')}</button>}
        {c.status !== 'ended' && c.joined && <button className="link muted small" disabled={busy} onClick={() => join(false)}>{t('Sair do desafio')}</button>}
        {c.song && <Link className="link small" to={`/musica/${c.song}`}>{t('Ver a música')}</Link>}
        <button className="link small ic-row" onClick={toggle}><Users size={14} /> {t('Participantes')} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
      </div>
      {open && (
        <div className="ch-board">
          {!board && <p className="muted small">{t('Carregando…')}</p>}
          {board && !board.length && <p className="muted small">{t('Ninguém entrou ainda. Seja o primeiro!')}</p>}
          {board?.map((b) => (
            <div key={b.id} className={`ch-row ${b.me ? 'me' : ''}`}>
              <Avatar p={b} size={28} />
              <span className="ch-name"><Flag cc={ccOf(b.id)} />{b.nickname || t('Jogador')}<TeamTag team={teamOf(b.id)} /></span>
              <span className="ch-bar"><span style={{ width: `${Math.min(100, (b.progress / c.goal) * 100)}%` }} /></span>
              <b className="ch-n">{b.done ? <Check size={14} /> : `${b.progress}/${c.goal}`}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

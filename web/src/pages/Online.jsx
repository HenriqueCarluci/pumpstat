import { Flag, useCountries } from '../lib/country.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { fmtNum, t, tErr } from '../lib/i18n.js';
import { QUICK_MESSAGES } from '../lib/presence.js';
import { Ball } from '../components/ui.jsx';
import { Chips } from './Songs.jsx';
import { pbTier } from '../lib/piu.js';
import { Check, ChevronRight, Eye, Gamepad2, MapPin, Swords } from '../components/Icons.jsx';
import ReportBlock from '../components/ReportBlock.jsx';
import { TeamTag, useTeams } from '../lib/teams.jsx';
import { isOn } from '../lib/plans.js';
import { StatusDot } from '../components/StatusPicker.jsx';
import LiveBadge from '../components/LiveBadge.jsx';
import { useLives } from '../lib/lives.js';

const MATCH = { close: ['Bom x1', 'x1-close'], near: ['Nível parecido', 'x1-near'] };

/** Quem está com o app aberto agora, com convite para jogar e sugestão de x1. */
export default function Online() {
  const { presence, plan } = useData();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null); // id do jogador com o convite aberto
  const [filter, setFilter] = useState('all');
  const lives = useLives(isOn(plan, 'twitch_live'));

  const load = () => rpc('online_players').then(setList).catch((e) => setErr(tErr(e.message)));
  useEffect(() => {
    load();
    const h = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(h);
  }, []);

  const setMode = async (m) => {
    try { await rpc('set_presence_mode', { p_mode: m }); presence.refresh(); } catch (e) { setErr(tErr(e.message)); }
  };

  if (!isOn(plan, 'online')) return <div className="page"><p className="empty">{t('Este recurso está desligado no momento.')}</p></div>;
  const all = list || [];
  const x1 = all.filter((p) => p.match === 'close' || p.match === 'near').slice(0, 3);
  const inX1 = new Set(x1.map((p) => p.id));
  const hasFriends = all.some((p) => p.friend), hasVenue = all.some((p) => p.same_venue);
  // quem já está nas sugestões não se repete embaixo (a não ser num filtro específico)
  const rest = all.filter((p) => (filter === 'friends' ? p.friend : filter === 'venue' ? p.same_venue : !inX1.has(p.id)));
  const row = (p, k) => <OnlineRow key={k} p={p} live={lives.get(p.id)} open={open === k} onToggle={() => setOpen(open === k ? null : k)} onSent={load} />;

  return (
    <div className="page online">
      <div className="on-head">
        <h2><span className="dot-on" /> {t('Online agora')} {list && <span className="muted">({all.length})</span>}</h2>
        <p className="muted small">{t('Quem está com o PIU Stats aberto. Chame para jogar: a pessoa recebe o convite na hora.')}</p>
      </div>

      <div className="on-vis">
        <span className="on-vis-l ic-row"><Eye size={15} /> {t('Quem pode me ver')}</span>
        <Chips value={presence.mode || 'all'} onChange={setMode}
          options={[['all', t('Todos')], ['friends', t('Só amigos')], ['off', t('Ninguém')]]} />
        {presence.mode === 'off' && <p className="muted tiny">{t('Você está invisível: não aparece na lista e não recebe convites.')}</p>}
      </div>

      {err && <div className="form-err">{err}</div>}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}
      {list && !all.length && <p className="empty">{t('Ninguém online agora além de você. Chame seus amigos para usar o PIU Stats!')}</p>}

      {x1.length > 0 && filter === 'all' && (
        <section className="on-sec">
          <h3 className="ic-row"><Swords size={18} /> {t('Sugestões de x1')}</h3>
          <p className="muted small">{t('Jogadores online com PUMBILITY e maior nível passado parecidos com os seus (Phoenix 2).')}</p>
          <div className="online-list">{x1.map((p) => row(p, `x-${p.id}`))}</div>
        </section>
      )}

      {all.length > 0 && (
        <section className="on-sec">
          <div className="on-list-h">
            <h3>{filter === 'all' && x1.length ? t('Mais gente online') : t('Online')} <span className="muted">({rest.length})</span></h3>
            {(hasFriends || hasVenue) && (
              <Chips value={filter} onChange={setFilter}
                options={[['all', t('Todos')], ...(hasFriends ? [['friends', t('Amigos')]] : []), ...(hasVenue ? [['venue', t('No meu fliperama')]] : [])]} />
            )}
          </div>
          {!rest.length && <p className="muted small">{filter === 'all' ? t('Todo mundo online já está nas sugestões acima.') : t('Ninguém nesse filtro agora.')}</p>}
          <div className="online-list">{rest.map((p) => row(p, p.id))}</div>
        </section>
      )}
      <p className="muted tiny"><Link to="/jogadores" className="ic-row">{t('Amigos')} <ChevronRight size={14} /></Link></p>
    </div>
  );
}

function OnlineRow({ p, live, open, onToggle, onSent }) {
  const teamOf = useTeams([p.id]);
  const ccOf = useCountries([p.id]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(p.invited);
  const send = async (text) => {
    setBusy(true); setErr('');
    try { await rpc('send_invite', { p_user: p.id, p_message: text || msg }); setSent(true); onSent?.(); onToggle(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const match = MATCH[p.match];
  const tier = p.pumbility != null ? pbTier(p.pumbility) : null;
  return (
    <div className={`online-row${match ? ` m-${p.match}` : ''}`}>
      <div className="online-main">
        <Link to={`/jogador/${p.id}`} className="q-avatar online-av" aria-label={t('Ver perfil de {n}', { n: p.nickname || t('Jogador') })}>
          {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : <Gamepad2 size={20} />}
          <StatusDot status={p.status || 'online'} className="av-dot" />
        </Link>
        <div className="online-info">
          <div className="online-nick"><Flag cc={ccOf(p.id)} /><Link to={`/jogador/${p.id}`} className="online-nick-link"><b>{p.nickname || t('Jogador')}</b></Link></div>
          {p.title && <div className="online-title">{p.title}</div>}
          <div className="online-stats">
            {tier && <span className="online-pb" title="PUMBILITY">{tier.icon && <img src={tier.icon} alt="" referrerPolicy="no-referrer" />}{fmtNum(Math.round(p.pumbility))}</span>}
            {(p.max?.S || p.max?.D) && (
              <span className="online-max" title={t('Maior nível já passado') + (p.max.version === 'phoenix' ? ' (Phoenix)' : '')}>
                {p.max.S && <Ball chart={{ mode: 'S', level: p.max.S }} size="sm" />}
                {p.max.D && <Ball chart={{ mode: 'D', level: p.max.D }} size="sm" />}
                {p.max.version === 'phoenix' && <small className="muted">P1</small>}
              </span>
            )}
          </div>
          <div className="online-tags">
            <LiveBadge live={live} />
            {match && <span className={`tag ${match[1]}`}><Swords size={11} /> {t(match[0])}</span>}
            {p.friend && <span className="tag">{t('amigo')}</span>}
            <TeamTag team={teamOf(p.id)} />
            {(p.status === 'away' || p.status === 'busy') && <span className={`tag on-st ${p.status}`}>{p.status === 'away' ? t('Ausente') : t('Ocupado')}</span>}
            {p.same_venue ? <span className="tag here"><MapPin size={11} /> {t('No mesmo fliperama')}</span> : p.venue && <span className="tag venue"><MapPin size={11} /> <span>{p.venue}</span></span>}
          </div>
        </div>
        <div className="online-cta">
          {sent ? <span className="tag ok"><Check size={12} /> {t('Convidado')}</span>
            : p.status === 'busy' ? <span className="tag" title={t('Não recebe convites para jogar nem avisos na tela')}>{t('Ocupado')}</span>
              : <button className={`btn sm${open ? ' ghost' : ''}`} onClick={onToggle}>{open ? t('Fechar') : t('Chamar')}</button>}
        </div>
      </div>
      {open && !sent && (
        <div className="invite-box">
          <div className="chips">
            {QUICK_MESSAGES.map((m) => <button key={m} disabled={busy} onClick={() => send(t(m))}>{t(m)}</button>)}
          </div>
          <div className="q-join">
            <input maxLength={140} placeholder={t('Ou escreva uma mensagem…')} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button className="btn" disabled={busy || !msg.trim()} onClick={() => send()}>{t('Enviar')}</button>
          </div>
          {err && <div className="form-err">{err}</div>}
          <ReportBlock compact user={p.id} name={p.nickname} context={{ where: 'online' }} onBlocked={onSent} />
        </div>
      )}
      {err && !open && <div className="form-err">{err}</div>}
    </div>
  );
}

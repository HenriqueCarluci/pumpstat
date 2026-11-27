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
import { Check, ChevronRight, Gamepad2, MapPin, Swords } from '../components/Icons.jsx';
import ReportBlock from '../components/ReportBlock.jsx';
import { TeamTag, useTeams } from '../lib/teams.jsx';
import { isOn } from '../lib/plans.js';
import { StatusDot } from '../components/StatusPicker.jsx';

const MATCH = { close: ['Bom x1', 'x1-close'], near: ['Nível parecido', 'x1-near'] };

/** Quem está com o app aberto agora, com convite para jogar e sugestão de x1. */
export default function Online() {
  const { presence, plan } = useData();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null); // id do jogador com o convite aberto

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
  const x1 = (list || []).filter((p) => p.match === 'close' || p.match === 'near').slice(0, 3);

  return (
    <div className="page online">
      <h2><span className="dot-on" /> {t('Online agora')}</h2>
      <p className="muted small">{t('Quem está com o PIU Stats aberto. Chame para jogar: a pessoa recebe o convite na hora.')}</p>

      <div className="card">
        <div className="rv-label">{t('Quem pode me ver online')}</div>
        <Chips value={presence.mode || 'all'} onChange={setMode}
          options={[['all', t('Todos')], ['friends', t('Só amigos')], ['off', t('Ninguém')]]} />
        {presence.mode === 'off' && <p className="muted small">{t('Você está invisível: não aparece na lista e não recebe convites.')}</p>}
      </div>

      {err && <div className="form-err">{err}</div>}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}

      {x1.length > 0 && (
        <section>
          <h3 className="ic-row"><Swords size={18} /> {t('Sugestões de x1')}</h3>
          <p className="muted small">{t('Jogadores online com PUMBILITY parecido com o seu (Phoenix 2).')}</p>
          <div className="online-list">{x1.map((p) => <OnlineRow key={`x-${p.id}`} p={p} open={open === `x-${p.id}`} onToggle={() => setOpen(open === `x-${p.id}` ? null : `x-${p.id}`)} onSent={load} />)}</div>
        </section>
      )}

      {list && (
        <section>
          <h3>{t('Todos online')} <span className="muted">({list.length})</span></h3>
          {!list.length && <p className="empty">{t('Ninguém online agora além de você. Chame seus amigos para usar o PIU Stats!')}</p>}
          <div className="online-list">{list.map((p) => <OnlineRow key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} onSent={load} />)}</div>
        </section>
      )}
      <p className="muted tiny"><Link to="/jogadores" className="ic-row">{t('Amigos')} <ChevronRight size={14} /></Link></p>
    </div>
  );
}

function OnlineRow({ p, open, onToggle, onSent }) {
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
  return (
    <div className="online-row">
      <div className="online-main">
        <Link to={`/jogador/${p.id}`} className="q-avatar online-av" aria-label={t('Ver perfil de {n}', { n: p.nickname || t('Jogador') })}>
          {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : <Gamepad2 size={20} />}
          <StatusDot status={p.status || 'online'} className="av-dot" />
        </Link>
        <div className="online-info">
          <div className="online-nick"><Flag cc={ccOf(p.id)} /><Link to={`/jogador/${p.id}`} className="online-nick-link"><b>{p.nickname || t('Jogador')}</b></Link><TeamTag team={teamOf(p.id)} />{p.pumbility != null && <span className="online-pb">{pbTier(p.pumbility).icon && <img src={pbTier(p.pumbility).icon} alt="" referrerPolicy="no-referrer" />}{fmtNum(Math.round(p.pumbility))}</span>}</div>
          {p.title && <div className="online-title">{p.title}</div>}
          {(p.status === 'away' || p.status === 'busy') && <div className={`small st-label st-${p.status}`}>{p.status === 'away' ? t('Ausente') : t('Ocupado')}</div>}
          {(p.max?.S || p.max?.D) && (
            <div className="online-max" title={t('Maior nível já passado')}>
              <span className="muted small">{t('Maior passado')}{p.max.version === 'phoenix' ? ' (Phoenix)' : ''}:</span>
              {p.max.S && <Ball chart={{ mode: 'S', level: p.max.S }} size="sm" />}
              {p.max.D && <Ball chart={{ mode: 'D', level: p.max.D }} size="sm" />}
            </div>
          )}
          <div className="online-tags">
            {match && <span className={`tag ${match[1]}`}>{t(match[0])}</span>}
            {p.same_venue ? <span className="tag here ic-row"><MapPin size={12} /> {t('No mesmo fliperama')}</span> : p.venue && <span className="tag ic-row"><MapPin size={12} /> {p.venue}</span>}
            {p.friend && <span className="tag">{t('amigo')}</span>}
          </div>
        </div>
        {sent ? <span className="tag ic-row">{t('Convite enviado')} <Check size={12} /></span>
          : p.status === 'busy' ? <span className="tag" title={t('Não recebe convites para jogar nem avisos na tela')}>{t('Ocupado')}</span>
            : <button className="btn" onClick={onToggle}>{t('Chamar')}</button>}
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

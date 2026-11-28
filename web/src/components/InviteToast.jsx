import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { rpc } from '../lib/api.js';
import { canAlert, showAlert } from '../lib/notify.js';
import { t } from '../lib/i18n.js';
import { CircleCheck, Gamepad2, MapPin, MessageCircle } from './Icons.jsx';

const who = (p) => p.nickname || p.title || t('Um jogador');

/** Aviso flutuante quando alguém te chama para jogar (e quando respondem ao seu convite). */
export default function InviteToast() {
  const { presence, plan } = useData();
  const enabled = isOn(plan, 'online');
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => new Set());
  const alerted = useRef(new Set());
  const invite = presence.invites.find((i) => !hidden.has(`i${i.invite}`));
  const reply = presence.replies.find((r) => !hidden.has(`r${r.invite}`) && !seenReply(r.invite));

  // aviso do sistema (se permitido) quando chega convite novo com o app em segundo plano
  useEffect(() => {
    for (const i of presence.invites) {
      if (alerted.current.has(i.invite)) continue;
      alerted.current.add(i.invite);
      if (canAlert() && Notification.permission === 'granted' && document.hidden) {
        showAlert(`${who(i)}: ${i.message || t('Bora jogar?')}`, `inv${i.invite}`, i.avatar);
      }
    }
  }, [presence.invites]);

  const hide = (k) => setHidden((s) => new Set(s).add(k));
  const respond = async (i, accept) => {
    hide(`i${i.invite}`);
    try { await rpc('respond_invite', { p_invite: i.invite, p_accept: accept }); } catch { /* ignora */ }
    presence.refresh();
  };

  // ocupado: nada pula na tela (os convites continuam nas notificações)
  if (!enabled || presence.status === 'busy') return null;
  if (invite && invite.kind === 'message') {
    return (
      <div className="toast invite">
        <div className="toast-h"><MessageCircle size={18} /> {who(invite)}</div>
        <div className="toast-msg">{invite.message}</div>
        <div className="bm-row">
          <button className="btn" onClick={() => { respond(invite, true); navigate(`/jogador/${invite.id}`); }}>{t('Responder')}</button>
          <button className="btn ghost" onClick={() => respond(invite, true)}>OK</button>
        </div>
      </div>
    );
  }
  if (invite) {
    return (
      <div className="toast invite">
        <div className="toast-h"><Gamepad2 size={18} /> {t('{who} te chamou para jogar', { who: who(invite) })}</div>
        {invite.message && <div className="toast-msg">“{invite.message}”</div>}
        {invite.venue && <div className="muted small ic-row"><MapPin size={14} /> {invite.venue}</div>}
        <div className="bm-row">
          <button className="btn" onClick={() => respond(invite, true)}>{t('Bora!')}</button>
          <button className="btn ghost" onClick={() => respond(invite, false)}>{t('Agora não')}</button>
        </div>
      </div>
    );
  }
  if (reply) {
    return (
      <div className={`toast ${reply.status}`} onClick={() => { markReply(reply.invite); hide(`r${reply.invite}`); }}>
        <div className="toast-h">
          {reply.status === 'accepted' ? <><CircleCheck size={18} /> {t('{who} aceitou seu convite!', { who: who(reply) })}</> : t('{who} não pode agora.', { who: who(reply) })}
        </div>
        <div className="muted small">{t('Toque para fechar')}</div>
      </div>
    );
  }
  return null;
}

const KEY = 'stepclub:seen-replies';
const seenReply = (id) => { try { return JSON.parse(localStorage.getItem(KEY) || '[]').includes(id); } catch { return false; } };
const markReply = (id) => { try { localStorage.setItem(KEY, JSON.stringify([...JSON.parse(localStorage.getItem(KEY) || '[]'), id].slice(-50))); } catch { /* ignora */ } };

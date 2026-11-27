import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { timeAgo } from './ui.jsx';
import { CheckCheck, MessageCircle, Send, Swords } from './Icons.jsx';

/** Minichat com um amigo, com botão de chamar para x1. Atualiza a cada 5 s com a tela aberta. */
export default function MiniChat({ user, name }) {
  const [msgs, setMsgs] = useState(null);
  const [online, setOnline] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef(null);

  const load = async () => {
    try {
      const [m, on] = await Promise.all([rpc('chat_with', { p_user: user }), rpc('is_online', { p_user: user })]);
      setMsgs(m); setOnline(on);
      // o que chegou para mim e eu estou vendo conta como lido
      m.filter((x) => !x.mine && x.status === 'pending' && x.kind === 'message')
        .forEach((x) => rpc('respond_invite', { p_invite: x.id, p_accept: true }).catch(() => {}));
    } catch (e) { setErr(tErr(e.message)); }
  };
  useEffect(() => {
    load();
    const h = setInterval(() => { if (!document.hidden) load(); }, 5000);
    return () => clearInterval(h);
  }, [user]); // eslint-disable-line
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);

  const send = async (kind, message) => {
    setBusy(true); setErr('');
    try {
      await rpc('send_invite', { p_user: user, p_message: message, p_kind: kind });
      if (kind === 'message') setText('');
      await load();
    } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };

  return (
    <section className="card minichat" id="chat">
      <div className="mc-head">
        <h3 className="ic-row"><MessageCircle size={18} /> <span className="mc-name">{name || t('Jogador')}</span></h3>
        <span className={`mc-status ${online ? 'on' : ''}`}>{online ? <><span className="dot-on" /> {t('online agora')}</> : t('offline')}</span>
      </div>
      <div className="mc-list" ref={box}>
        {msgs && !msgs.length && <p className="muted small center">{t('Nenhuma mensagem ainda. Diga oi ou chame para um x1!')}</p>}
        {(msgs || []).map((m) => (
          <div key={m.id} className={`mc-msg ${m.mine ? 'mine' : ''} ${m.kind}`}>
            {m.kind === 'invite' && <b className="mc-invite ic-row"><Swords size={14} /> {t('Convite para jogar')}</b>}
            {m.message && <span className="mc-text">{m.message}</span>}
            <small>
              {timeAgo(m.at)}
              {m.kind === 'invite' && m.status !== 'pending' && ` · ${m.status === 'accepted' ? t('aceito') : t('recusado')}`}
              {m.mine && m.kind === 'message' && m.status !== 'pending' && <> · <CheckCheck size={12} className="read" /></>}
            </small>
          </div>
        ))}
      </div>
      <form className="mc-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send('message', text); }}>
        <input maxLength={140} placeholder={t('Escreva uma mensagem…')} value={text} onChange={(e) => setText(e.target.value)}
          aria-label={t('Mensagem')} enterKeyHint="send" autoComplete="off" />
        <button className="btn" disabled={busy || !text.trim()} aria-label={t('Enviar')}><Send size={16} /><span>{t('Enviar')}</span></button>
      </form>
      <button className="btn ghost wide mc-x1" disabled={busy} onClick={() => send('invite', t('Bora um x1?'))}><Swords size={16} /> {t('Chamar para x1')}</button>
      {!online && <p className="muted tiny">{t('Se estiver offline, a pessoa vê quando abrir o app (convites valem por 2 h).')}</p>}
      {err && <div className="form-err">{err}</div>}
    </section>
  );
}

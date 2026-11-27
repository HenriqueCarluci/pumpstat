import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { timeAgo } from './ui.jsx';
import { CheckCheck, MessageCircle, Send, Swords } from './Icons.jsx';

const EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '💪'];

/** Minichat com um amigo, com botão de chamar para x1. Atualiza a cada 5 s com a tela aberta. Toque numa mensagem para reagir. */
export default function MiniChat({ user, name }) {
  const [msgs, setMsgs] = useState(null);
  const [online, setOnline] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [picker, setPicker] = useState(null);
  const box = useRef(null);
  const stick = useRef(true);

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
  // só desce sozinho quando já estava no fim (reagir numa mensagem antiga não pula a lista)
  useEffect(() => { if (box.current && stick.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  const onScroll = () => { const b = box.current; if (b) stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 40; };

  const react = async (m, emoji) => {
    setPicker(null);
    const mineNow = (m.reactions || []).find((r) => r.mine)?.e;
    const next = mineNow === emoji ? null : emoji;
    // otimista: troca a minha reação na hora
    setMsgs((list) => list.map((x) => (x.id !== m.id ? x
      : { ...x, reactions: [...(x.reactions || []).filter((r) => !r.mine), ...(next ? [{ e: next, mine: true }] : [])] })));
    try { await rpc('react_message', { p_invite: m.id, p_emoji: next }); } catch (e) { setErr(tErr(e.message)); load(); }
  };

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
      <div className="mc-list" ref={box} onScroll={onScroll}>
        {msgs && !msgs.length && <p className="muted small center">{t('Nenhuma mensagem ainda. Diga oi ou chame para um x1!')}</p>}
        {(msgs || []).map((m) => {
          const groups = Object.entries((m.reactions || []).reduce((a, r) => { (a[r.e] ||= { n: 0, mine: false }).n++; if (r.mine) a[r.e].mine = true; return a; }, {}));
          return (
            <div key={m.id} className={`mc-row ${m.mine ? 'mine' : ''}`}>
              <div className={`mc-msg ${m.mine ? 'mine' : ''} ${m.kind}`} role="button" tabIndex={0}
                onClick={() => setPicker(picker === m.id ? null : m.id)} onKeyDown={(e) => { if (e.key === 'Enter') setPicker(picker === m.id ? null : m.id); }}
                aria-label={t('Reagir à mensagem')} aria-expanded={picker === m.id}>
                {m.kind === 'invite' && <b className="mc-invite ic-row"><Swords size={14} /> {t('Convite para jogar')}</b>}
                {m.message && <span className="mc-text">{m.message}</span>}
                <small>
                  {timeAgo(m.at)}
                  {m.kind === 'invite' && m.status !== 'pending' && ` · ${m.status === 'accepted' ? t('aceito') : t('recusado')}`}
                  {m.mine && m.kind === 'message' && m.status !== 'pending' && <> · <CheckCheck size={12} className="read" /></>}
                </small>
              </div>
              {picker === m.id && (
                <div className="mc-picker" role="menu" aria-label={t('Reagir à mensagem')}>
                  {EMOJIS.map((e) => {
                    const on = (m.reactions || []).some((r) => r.mine && r.e === e);
                    return <button key={e} type="button" role="menuitemradio" aria-checked={on} className={on ? 'on' : ''} onClick={() => react(m, e)}>{e}</button>;
                  })}
                </div>
              )}
              {groups.length > 0 && (
                <div className="mc-reacts">
                  {groups.map(([e, g]) => (
                    <button key={e} type="button" className={g.mine ? 'mine' : ''} onClick={() => (g.mine ? react(m, e) : setPicker(m.id))}
                      title={g.mine ? t('Tirar reação') : t('Reagir à mensagem')}>
                      {e}{g.n > 1 && <b>{g.n}</b>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

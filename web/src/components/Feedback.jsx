import { useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { accessToken } from '../lib/auth.js';
import { API_URL } from '../lib/config.js';
import { getLang, t, tErr } from '../lib/i18n.js';
import { CircleCheck, LifeBuoy } from './Icons.jsx';
import { Chips } from '../pages/Songs.jsx';

const KINDS = [['question', 'Dúvida'], ['bug', 'Problema'], ['idea', 'Sugestão'], ['other', 'Outro']];

/** Formulário de ajuda e feedback. Salva no Supabase e a API manda o e-mail para o suporte. */
export default function Feedback() {
  const { session, version } = useData();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('question');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState(session?.email || '');
  const [withInfo, setWithInfo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (message.trim().length < 3) { setErr(t('escreva uma mensagem')); return; }
    setBusy(true); setErr('');
    const meta = withInfo ? {
      page: window.location.hash, lang: getLang(), version, ua: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      build: [...document.scripts].map((s) => s.src).find((s) => s.includes('/assets/'))?.split('/assets/')[1],
    } : {};
    try {
      const id = await rpc('submit_feedback', { p_kind: kind, p_message: message, p_contact: contact, p_meta: meta });
      // a API manda o e-mail; se falhar, a mensagem continua salva no banco
      try {
        const token = await accessToken();
        await fetch(`${API_URL}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id, kind, message, contact, meta }),
        });
      } catch { /* ignora */ }
      setDone(true); setMessage('');
    } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };

  if (!open) {
    return (
      <button className="btn ghost wide" onClick={() => { setOpen(true); setDone(false); }}>
        <LifeBuoy size={16} /> {t('Falar com o suporte')}
      </button>
    );
  }
  if (done) {
    return (
      <div className="feedback-done">
        <CircleCheck size={28} />
        <div>
          <b>{t('Mensagem enviada')}</b>
          <p className="muted small">{t('Obrigado! Vamos responder no e-mail informado.')}</p>
        </div>
        <button className="btn ghost" onClick={() => { setDone(false); setOpen(false); }}>{t('Fechar')}</button>
      </div>
    );
  }
  return (
    <form className="feedback" onSubmit={submit}>
      <div className="rv-label">{t('Sobre o que é?')}</div>
      <Chips value={kind} onChange={setKind} options={KINDS.map(([k, l]) => [k, t(l)])} />
      <textarea rows={5} maxLength={2000} required value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder={kind === 'bug' ? t('O que aconteceu? Em qual tela? O que você esperava?') : t('Conte com detalhes como podemos ajudar.')} />
      <label className="field">{t('E-mail para resposta')}
        <input type="email" value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={withInfo} onChange={(e) => setWithInfo(e.target.checked)} />
        <span>{t('Incluir informações do aparelho e da tela (ajuda a resolver problemas)')}</span>
      </label>
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" disabled={busy}>{busy ? t('Enviando…') : t('Enviar')}</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</button>
      </div>
    </form>
  );
}

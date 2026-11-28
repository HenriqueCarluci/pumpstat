// Ações do admin num chamado do suporte, iguais em Admin → Suporte e em Admin → Backlog.
// Uma barra só: a ação principal em destaque, as outras ao lado; "Responder" abre o campo no lugar da barra.
import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { Check, MessageCircle, Send } from './Icons.jsx';

const TRACK = (x) => x.kind === 'bug' || x.kind === 'idea';
const MODES = [
  ['reply', 'Só responder', 'O chamado continua onde está.'],
  ['need_info', 'Pedir detalhes', 'Sai da fila até a pessoa responder pelo app.'],
  ['answered', 'Responder e encerrar', 'Fecha o chamado.'],
];

export default function TicketActions({ x, onChange, canAnswer = true }) {
  const [compose, setCompose] = useState(false);
  const [text, setText] = useState('');
  const [mode, setMode] = useState(x.status === 'open' && !TRACK(x) ? 'answered' : 'reply');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fromUser = canAnswer && !!(x.user || x.email || (x.nickname && x.origin !== 'admin' && x.origin !== 'backlog do produto'));
  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await onChange?.(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const decide = (d) => {
    if (d === 'rejected' && !window.confirm(t('Recusar este item? Quem enviou recebe o aviso.'))) return;
    act(() => rpc('admin_feedback_decide', { p_id: x.id, p_decision: d, p_note: null }));
  };
  const mark = (s) => act(() => rpc('admin_feedback_status', { p_id: x.id, p_status: s }));
  const send = () => act(async () => {
    await rpc('admin_feedback_answer', { p_id: x.id, p_reply: text, p_action: mode });
    setText(''); setCompose(false);
  });

  if (compose) {
    return (
      <div className="tk-compose">
        <textarea rows={3} maxLength={1000} value={text} autoFocus onChange={(e) => setText(e.target.value)}
          placeholder={t('Escreva a resposta. Ela aparece em Meus chamados de quem abriu e chega como aviso.')} />
        <div className="tk-modes" role="radiogroup">
          {MODES.map(([m, l, d]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              <b>{t(l)}</b><small>{t(d)}</small>
            </button>
          ))}
        </div>
        {err && <div className="form-err">{err}</div>}
        <div className="tk-actions">
          <button type="button" className="btn sm" disabled={busy || text.trim().length < 3} onClick={send}><Send size={14} /> {busy ? t('Enviando…') : t('Enviar resposta')}</button>
          <button type="button" className="btn ghost sm" onClick={() => { setCompose(false); setErr(''); }}>{t('Cancelar')}</button>
        </div>
      </div>
    );
  }

  const closed = !['open', 'approved', 'need_info'].includes(x.status);
  const answerBtn = fromUser && !closed && (
    <button type="button" className={`btn sm ${TRACK(x) && x.status === 'open' ? 'ghost' : ''}`} disabled={busy} onClick={() => setCompose(true)}>
      <MessageCircle size={14} /> {t('Responder')}
    </button>
  );
  return (
    <>
      <div className="tk-actions">
        {TRACK(x) && x.status === 'open' && (
          <button type="button" className="btn sm" disabled={busy} onClick={() => decide('approved')}>
            <Check size={14} /> {x.kind === 'bug' ? t('Aprovar para correção') : t('Aprovar para a semanal')}
          </button>
        )}
        {answerBtn}
        {TRACK(x) && x.status === 'open' && <button type="button" className="btn ghost sm danger-text" disabled={busy} onClick={() => decide('rejected')}>{t('Recusar')}</button>}
        {TRACK(x) && x.status === 'approved' && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => decide('open')}>{t('Devolver para decidir')}</button>}
        {!TRACK(x) && !closed && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => mark('done')}><Check size={14} /> {t('Encerrar sem resposta')}</button>}
        {!TRACK(x) && closed && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => mark('open')}>{t('Reabrir')}</button>}
        {x.email && <a className="tk-mail small" href={`mailto:${x.contact || x.email}?subject=${encodeURIComponent(`PIU Stats #${x.id}`)}`}>{t('Responder por e-mail')}</a>}
      </div>
      {err && <div className="form-err">{err}</div>}
    </>
  );
}

// Suporte → "Meus chamados": quem abriu um ticket pelo app acompanha o andamento e a resposta do suporte.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import Feedback from '../components/Feedback.jsx';
import { rpc } from '../lib/api.js';
import { locale, t, tErr } from '../lib/i18n.js';
import { Check, ChevronLeft, LifeBuoy, Send } from '../components/Icons.jsx';
import { Chips } from './Songs.jsx';
import { ticketStatus } from '../lib/tickets.js';

const KIND = { question: 'Dúvida', bug: 'Problema', idea: 'Sugestão', other: 'Outro' };
const fmtDay = (s) => (s ? new Date(s).toLocaleDateString(locale(), { day: '2-digit', month: 'short' }) : '');
const OPEN = ['open', 'approved', 'need_info'];

function Steps({ f }) {
  const track = f.kind === 'bug' || f.kind === 'idea';
  const closed = !OPEN.includes(f.status);
  const negative = f.status === 'wontfix' || f.status === 'rejected';
  const steps = track
    ? [
      [t('Recebido'), f.at, true],
      [f.kind === 'bug' ? t('Aprovado para correção') : t('Aprovada para a semanal'), f.decided_at, !!f.decided_at && !negative],
      [negative ? t('Encerrado') : f.kind === 'bug' ? t('Corrigido') : t('Entregue'), f.resolved_at, closed],
    ]
    : [[t('Recebido'), f.at, true], [t('Respondido'), f.resolved_at, closed]];
  return (
    <ol className="tk-steps">
      {steps.map(([l, d, on], i) => (
        <li key={i} className={on ? 'on' : ''}><span className="tk-dot">{on ? <Check size={11} /> : null}</span><span>{l}{on && d ? <small className="muted"> · {fmtDay(d)}</small> : null}</span></li>
      ))}
    </ol>
  );
}

function Ticket({ f, focus, onChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(focus || f.status === 'need_info');
  const [more, setMore] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focus]);
  const [label, tone] = ticketStatus(f);
  const preview = f.title || (f.message.length > 110 ? `${f.message.slice(0, 110)}…` : f.message);
  const send = async () => {
    setBusy(true); setErr('');
    try { await rpc('my_feedback_add_info', { p_id: f.id, p_text: more }); setMore(''); setSent(true); setAdding(false); onChange(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  return (
    <section ref={ref} className={`card tk ${focus ? 'focus' : ''}`}>
      <button type="button" className="tk-head" onClick={() => setOpen(!open)}>
        <span className="tk-meta"><span className="tag">{t(KIND[f.kind] || f.kind)} #{f.id}</span><small className="muted">{fmtDay(f.at)}</small></span>
        <b className="tk-title">{preview}</b>
        <span className={`tag tk-st ${tone}`}>{label}</span>
      </button>
      {open && (
        <div className="tk-body">
          <Steps f={f} />
          {(f.title || f.message.length > 110) && <p className="small tk-msg">{f.message}</p>}
          {f.shot && <a href={f.shot} target="_blank" rel="noopener noreferrer"><img className="fb-shot-img" src={f.shot} alt={t('Print do problema')} /></a>}
          {f.reply && (
            <div className="tk-reply"><b className="ic-row"><LifeBuoy size={14} /> {t('Resposta do suporte')}</b><p className="small">{f.reply}</p></div>
          )}
          {OPEN.includes(f.status) && f.status !== 'need_info' && !adding && (
            <div className="tk-actions"><button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>{t('Adicionar informação')}</button></div>
          )}
          {OPEN.includes(f.status) && (f.status === 'need_info' || adding) && (
            <div className="tk-more">
              <label className="small">{f.status === 'need_info' ? t('Responda aqui com os detalhes pedidos:') : t('Quer acrescentar alguma informação?')}</label>
              <textarea rows={3} maxLength={800} value={more} onChange={(e) => { setMore(e.target.value); setSent(false); }}
                placeholder={t('Escreva aqui…')} />
              {err && <div className="form-err">{err}</div>}
              {sent && <p className="ok small">{t('Enviado. O suporte vê isso junto com o seu chamado.')}</p>}
              <div className="tk-actions">
                <button className="btn sm" disabled={busy || more.trim().length < 3} onClick={send}><Send size={14} /> {busy ? t('Enviando…') : t('Enviar')}</button>
                {f.status !== 'need_info' && <button type="button" className="btn ghost sm" onClick={() => { setAdding(false); setMore(''); }}>{t('Cancelar')}</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function useMyTickets() {
  const { session } = useData();
  const [list, setList] = useState(null);
  const load = () => (session ? rpc('my_feedback').then(setList).catch(() => setList([])) : setList([]));
  useEffect(() => { load(); }, [session?.user?.id]); // eslint-disable-line
  return [list, load];
}

export default function Support() {
  const { session } = useData();
  const [params] = useSearchParams();
  const focus = Number(params.get('id')) || null;
  const [list, load] = useMyTickets();
  const [tab, setTab] = useState('open');
  useEffect(() => { if (focus && list && list.some((f) => f.id === focus && !OPEN.includes(f.status))) setTab('closed'); }, [focus, list]);
  const openList = (list || []).filter((f) => OPEN.includes(f.status));
  const closedList = (list || []).filter((f) => !OPEN.includes(f.status));
  const shown = tab === 'open' ? openList : closedList;
  return (
    <div className="page support">
      <Link className="btn ghost sm tk-back" to="/ajustes"><ChevronLeft size={14} /> {t('Ajustes')}</Link>
      <h2>{t('Suporte')}</h2>
      <p className="muted small">{t('Abra um chamado e acompanhe aqui o andamento e a resposta. Você também recebe um aviso a cada novidade.')}</p>
      <section className="card"><Feedback onSent={load} /></section>
      {!session ? <p className="empty">{t('Entre na sua conta para ver seus chamados.')}</p> : (
        <>
          <h3>{t('Meus chamados')}</h3>
          <Chips value={tab} onChange={setTab} options={[['open', `${t('Em andamento')} (${openList.length})`], ['closed', `${t('Encerrados')} (${closedList.length})`]]} />
          {!list && <p className="muted small">{t('Carregando…')}</p>}
          {list && !shown.length && <p className="empty small">{tab === 'open' ? t('Nenhum chamado em andamento.') : t('Nenhum chamado encerrado.')}</p>}
          {shown.map((f) => <Ticket key={f.id} f={f} focus={f.id === focus} onChange={load} />)}
        </>
      )}
    </div>
  );
}

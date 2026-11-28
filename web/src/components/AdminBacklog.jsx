import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { locale, t, tErr } from '../lib/i18n.js';
import { Check, Plus } from './Icons.jsx';
import { Chips } from '../pages/Songs.jsx';

// Quando as tarefas automáticas rodam (horário de Brasília): correção diária 18:51; versão semanal segunda 16:43.
function nextRuns() {
  const now = new Date();
  const sp = (d) => new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const local = sp(now);
  const offset = now.getTime() - local.getTime();
  const at = (days, h, m) => { const d = new Date(local); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return new Date(d.getTime() + offset); };
  let daily = at(0, 18, 51); if (daily <= now) daily = at(1, 18, 51);
  let dd = (1 - local.getDay() + 7) % 7; let weekly = at(dd, 16, 43); if (weekly <= now) weekly = at(dd + 7, 16, 43);
  const fmt = (d) => d.toLocaleString(locale(), { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return { daily: fmt(daily), weekly: fmt(weekly) };
}

const PRIO = [[1, 'Alta'], [2, 'Média'], [3, 'Baixa']];
const BUG_DONE = { fixed: 'Corrigido', wontfix: 'Não será corrigido', answered: 'Respondido', done: 'Resolvido', need_info: 'Esperando detalhes' };
const fmtDay = (s) => (s ? new Date(s).toLocaleDateString(locale(), { day: '2-digit', month: 'short' }) : '');

function Item({ x, children, prio, onPrio }) {
  const [open, setOpen] = useState(false);
  const long = (x.message || '').length > 160;
  return (
    <div className={`card bl-item bl-${x.kind}`}>
      <div className="row-between">
        <span className="bl-head">
          <span className="tag">#{x.id}</span>
          <span className={`tag bl-kind ${x.kind}`}>{x.kind === 'bug' ? t('Problema') : t('Melhoria')}</span>
          <b>{x.title || (x.message.length > 90 ? `${x.message.slice(0, 90)}…` : x.message)}</b>
        </span>
        {prio && (
          <select className={`bl-prio p${x.priority}`} value={x.priority} onChange={(e) => onPrio(x.id, Number(e.target.value))} title={t('Prioridade')}>
            {PRIO.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
          </select>
        )}
      </div>
      {(x.title || x.message.length > 90) && (
        <p className="small bl-msg">{open || !long ? x.message : `${x.message.slice(0, 160)}…`}{long && <button className="linkish" onClick={() => setOpen(!open)}>{open ? t('menos') : t('mais')}</button>}</p>
      )}
      {x.shot && <a href={x.shot} target="_blank" rel="noopener noreferrer"><img className="fb-shot-img" src={x.shot} alt={t('Print do problema')} /></a>}
      <small className="muted">
        {x.origin === 'admin' ? t('Seu item') : x.origin === 'backlog do produto' ? t('Backlog do produto') : x.nickname}
        {' · '}{fmtDay(x.at)}{x.page ? ` · ${x.page}` : ''}{x.app ? ` · app ${x.app}` : ''}
      </small>
      {x.reply && <p className="small bl-reply">{x.reply}</p>}
      {children}
    </div>
  );
}

/**
 * Admin → Backlog: tudo passa pela aprovação do admin. Problema aprovado → fila de correção diária;
 * melhoria aprovada → fila da versão semanal. As tarefas automáticas só pegam o que está aprovado, por prioridade.
 */
export default function AdminBacklog() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState('decide');
  const [note, setNote] = useState({});
  const [add, setAdd] = useState({ kind: 'idea', title: '', message: '', approved: true, priority: 2 });
  const [busy, setBusy] = useState(false);
  const load = () => rpc('admin_backlog').then(setData).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);
  if (!data) return err ? <div className="form-err">{err}</div> : <p className="muted small">{t('Carregando…')}</p>;

  const items = data.items || [];
  const byPrio = (a, b) => a.priority - b.priority || String(a.decided_at).localeCompare(String(b.decided_at));
  const bugsQueue = items.filter((x) => x.kind === 'bug' && x.status === 'approved').sort(byPrio);
  const bugsWait = items.filter((x) => x.kind === 'bug' && x.status === 'need_info');
  const bugsDone = items.filter((x) => x.kind === 'bug' && !['open', 'approved', 'need_info'].includes(x.status));
  const toDecide = items.filter((x) => x.status === 'open').sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'bug' ? -1 : 1));
  const approved = items.filter((x) => x.kind === 'idea' && x.status === 'approved').sort(byPrio);
  const delivered = items.filter((x) => x.kind === 'idea' && x.status === 'implemented');
  const rejected = items.filter((x) => x.kind === 'idea' && x.status === 'rejected');
  const runs = nextRuns();

  const act = async (fn) => { setErr(''); try { await fn(); await load(); } catch (e) { setErr(tErr(e.message)); } };
  const decide = (id, d) => act(() => rpc('admin_feedback_decide', { p_id: id, p_decision: d, p_note: note[id] || null }));
  const prio = (id, p) => act(() => rpc('admin_backlog_priority', { p_id: id, p_priority: p }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    await act(() => rpc('admin_backlog_add', { p_kind: add.kind, p_title: add.title, p_message: add.message, p_approved: add.approved, p_priority: add.priority }));
    setAdd({ kind: 'idea', title: '', message: '', approved: true, priority: 2 }); setBusy(false);
  };

  return (
    <div className="admin-backlog">
      <div className="bl-stats">
        <div className="card bl-stat"><b>{bugsQueue.length}</b><small>{t('Problemas na fila de correção')}</small><span className="muted tiny">{t('Correção diária: {d}', { d: runs.daily })}</span></div>
        <div className="card bl-stat"><b>{toDecide.length}</b><small>{t('Esperando sua decisão')}</small><span className="muted tiny">{t('Problemas e melhorias')}</span></div>
        <div className="card bl-stat"><b>{approved.length}</b><small>{t('Aprovadas para a semanal')}</small><span className="muted tiny">{t('Próxima versão semanal: {d}', { d: runs.weekly })}</span></div>
        <div className="card bl-stat"><b>{data.errors_24h ?? 0}</b><small>{t('Erros no app (24 h)')}</small><span className="muted tiny">{t('Registrados automaticamente')}</span></div>
      </div>

      <Chips wrap value={view} onChange={setView} options={[
        ['decide', `${t('Para decidir')} (${toDecide.length})`], ['approved', `${t('Semanal')} (${approved.length})`],
        ['bugs', `${t('Correção')} (${bugsQueue.length + bugsWait.length})`], ['done', t('Entregues')], ['new', t('Adicionar item')]]} />
      {err && <div className="form-err">{err}</div>}

      {view === 'decide' && (
        <>
          <p className="muted small">{t('Aprovar um problema coloca o ticket na fila de correção diária. Aprovar uma melhoria coloca o item na próxima versão semanal (no máximo 4 por semana, por prioridade). Quem reportou recebe o aviso.')}</p>
          {!toDecide.length && <p className="empty small">{t('Nada esperando decisão.')}</p>}
          {toDecide.map((x) => (
            <Item key={x.id} x={x} prio onPrio={prio}>
              <input className="bl-note" value={note[x.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [x.id]: e.target.value }))} maxLength={300}
                placeholder={t('Observação ou detalhe para o desenvolvimento (opcional)')} />
              <div className="bm-row">
                <button className="btn sm" onClick={() => decide(x.id, 'approved')}><Check size={14} /> {x.kind === 'bug' ? t('Aprovar para correção') : t('Aprovar para a semanal')}</button>
                <button className="btn ghost sm danger-text" onClick={() => { if (window.confirm(t('Recusar este item?'))) decide(x.id, 'rejected'); }}>{t('Recusar')}</button>
              </div>
            </Item>
          ))}
          {rejected.length > 0 && <p className="muted tiny">{t('{n} recusados nos últimos 45 dias.', { n: rejected.length })}</p>}
        </>
      )}

      {view === 'approved' && (
        <>
          <p className="muted small">{t('Ordem da próxima versão semanal: prioridade alta primeiro, depois a data em que foi aprovado. Itens grandes ou que precisam de decisão sua voltam no resumo da tarefa.')}</p>
          {!approved.length && <p className="empty small">{t('Nenhum item aprovado.')}</p>}
          {approved.map((x, i) => (
            <Item key={x.id} x={x} prio onPrio={prio}>
              <div className="bm-row">
                <span className={`tag ${i < 4 ? 'ok' : ''}`}>{i < 4 ? t('Entra na próxima semanal') : t('Fica para a seguinte')}</span>
                <button className="btn ghost sm" onClick={() => decide(x.id, 'open')}>{t('Devolver para decidir')}</button>
              </div>
            </Item>
          ))}
        </>
      )}

      {view === 'bugs' && (
        <>
          <p className="muted small">{t('Problemas que você aprovou. A correção diária trata até 5 por dia, por prioridade, e publica tudo numa versão só.')}</p>
          {!bugsQueue.length && !bugsWait.length && <p className="empty small">{t('Nenhum problema na fila de correção.')}</p>}
          {bugsQueue.map((x, i) => (
            <Item key={x.id} x={x} prio onPrio={prio}>
              <div className="bm-row">
                <span className={`tag ${i < 5 ? 'ok' : ''}`}>{i < 5 ? t('Entra na próxima correção') : t('Fica para a seguinte')}</span>
                <button className="btn ghost sm" onClick={() => decide(x.id, 'open')}>{t('Devolver para decidir')}</button>
              </div>
            </Item>
          ))}
          {bugsWait.map((x) => <Item key={x.id} x={x}><span className="tag">{t('Esperando detalhes de quem reportou')}</span></Item>)}
          {bugsDone.length > 0 && <div className="rv-label">{t('Resolvidos (45 dias)')}</div>}
          {bugsDone.map((x) => (
            <Item key={x.id} x={x}>
              <span className={`tag ${x.status === 'fixed' ? 'ok' : ''}`}>{t(BUG_DONE[x.status] || x.status)}{x.fixed_in ? ` · ${x.fixed_in}` : ''}{x.resolved_at ? ` · ${fmtDay(x.resolved_at)}` : ''}</span>
            </Item>
          ))}
        </>
      )}

      {view === 'done' && (
        <>
          {!delivered.length && <p className="empty small">{t('Nada entregue nos últimos 45 dias.')}</p>}
          {delivered.map((x) => (
            <Item key={x.id} x={x}><span className="tag ok">{t('Entregue')}{x.fixed_in ? ` · ${x.fixed_in}` : ''}{x.resolved_at ? ` · ${fmtDay(x.resolved_at)}` : ''}</span></Item>
          ))}
        </>
      )}

      {view === 'new' && (
        <form className="card bl-new" onSubmit={submit}>
          <Chips value={add.kind} onChange={(k) => setAdd((a) => ({ ...a, kind: k }))} options={[['idea', t('Melhoria')], ['bug', t('Bug')]]} />
          <input value={add.title} onChange={(e) => setAdd((a) => ({ ...a, title: e.target.value }))} maxLength={120} placeholder={t('Título curto')} />
          <textarea rows={5} required minLength={3} maxLength={2000} value={add.message} onChange={(e) => setAdd((a) => ({ ...a, message: e.target.value }))}
            placeholder={add.kind === 'bug' ? t('O que acontece, em qual tela e o que deveria acontecer.') : t('O que você quer no app, para quem e como deveria funcionar.')} />
          <label className="check"><input type="checkbox" checked={add.approved} onChange={(e) => setAdd((a) => ({ ...a, approved: e.target.checked }))} />
            <span>{add.kind === 'bug' ? t('Já aprovar para a correção diária') : t('Já aprovar para a versão semanal')}</span></label>
          <div className="bm-row"><span className="small">{t('Prioridade')}</span>
            <Chips value={add.priority} onChange={(p) => setAdd((a) => ({ ...a, priority: p }))} options={PRIO.map(([v, l]) => [v, t(l)])} /></div>
          <button className="btn" disabled={busy}><Plus size={15} /> {t('Adicionar')}</button>
        </form>
      )}
    </div>
  );
}

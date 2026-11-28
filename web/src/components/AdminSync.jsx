// Admin → Atualizar notas: roda a sincronização das notas na hora, para todos ou para quem o admin escolher.
// O servidor usa a sessão do piugame que a pessoa já deixou salva; quem não tem precisa sincronizar uma vez.
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../lib/api.js';
import { API_URL } from '../lib/config.js';
import { locale, t, tErr } from '../lib/i18n.js';
import { timeAgo } from './ui.jsx';
import { RefreshCw, Search } from './Icons.jsx';
import { Chips } from '../pages/Songs.jsx';

const kick = () => fetch(`${API_URL}/api/sync/tick`, { method: 'POST' }).catch(() => {});

function reqLabel(r) {
  if (!r) return null;
  if (r.status === 'queued') return [t('Na fila'), 'info'];
  if (r.status === 'running') return [t('Atualizando…'), 'warn'];
  if (r.status === 'done') return [t('Atualizado {when}', { when: timeAgo(r.finished) }), 'ok'];
  return [r.error === 'session_expired' ? t('Sessão expirada') : t('Falhou'), 'muted'];
}

export default function AdminSync() {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [view, setView] = useState('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = () => rpc('admin_sync_list').then(setList).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);
  const active = (list || []).some((u) => u.req && (u.req.status === 'queued' || u.req.status === 'running'));
  useEffect(() => {
    if (!active) return undefined;
    const h = setInterval(load, 5000);
    return () => clearInterval(h);
  }, [active]);

  const shown = useMemo(() => (list || []).filter((u) => {
    if (view === 'ready' && !u.has_session) return false;
    if (view === 'no' && u.has_session) return false;
    return !q || (u.nickname || '').toLowerCase().includes(q.toLowerCase());
  }), [list, q, view]);
  const ready = (list || []).filter((u) => u.has_session);

  const request = async (users) => {
    if (!users && !window.confirm(t('Atualizar as notas de todas as {n} pessoas com sessão salva? Pode levar alguns minutos.', { n: ready.length }))) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await rpc('admin_sync_request', { p_users: users });
      kick();
      setMsg(t('{q} na fila. {s} sem sessão salva ficaram de fora.', { q: r.queued, s: r.no_session }));
      setSel(new Set());
      await load();
    } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownReady = shown.filter((u) => u.has_session);
  const allOn = allShownReady.length > 0 && allShownReady.every((u) => sel.has(u.id));

  if (!list) return err ? <div className="form-err">{err}</div> : <p className="muted small">{t('Carregando…')}</p>;
  return (
    <section className="card admin-sync">
      <h3 className="ic-row"><RefreshCw size={17} /> {t('Atualizar notas')}</h3>
      <p className="muted small">{t('Roda agora a sincronização com a Pump para as pessoas escolhidas, usando a sessão do piugame que elas já deixaram salva. Quem não tem sessão salva precisa sincronizar uma vez com a senha AM.PASS.')}</p>
      <div className="as-actions">
        <button type="button" className="btn" disabled={busy || !ready.length} onClick={() => request(null)}><RefreshCw size={15} /> {t('Atualizar todos ({n})', { n: ready.length })}</button>
        <button type="button" className="btn ghost" disabled={busy || !sel.size} onClick={() => request([...sel])}>{t('Atualizar selecionados ({n})', { n: sel.size })}</button>
      </div>
      {msg && <p className="ok small">{msg}</p>}
      {err && <div className="form-err">{err}</div>}
      <div className="as-filters">
        <label className="as-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar jogador')} /></label>
        <Chips value={view} onChange={setView} options={[['all', `${t('Todos')} (${list.length})`], ['ready', `${t('Com sessão')} (${ready.length})`], ['no', `${t('Sem sessão')} (${list.length - ready.length})`]]} />
      </div>
      <label className="check as-all">
        <input type="checkbox" checked={allOn} disabled={!allShownReady.length} onChange={() => setSel(allOn ? new Set() : new Set(allShownReady.map((u) => u.id)))} />
        <span className="small">{t('Selecionar todos da lista')}</span>
      </label>
      <ul className="as-list">
        {shown.map((u) => {
          const st = reqLabel(u.req);
          return (
            <li key={u.id} className={!u.has_session ? 'off' : ''}>
              <label className="check">
                <input type="checkbox" disabled={!u.has_session} checked={sel.has(u.id)} onChange={() => toggle(u.id)} />
                <span className="as-who">
                  <b>{u.nickname || t('Jogador')}</b>
                  <small className="muted">
                    {u.last_sync ? t('Última sincronização {when}', { when: timeAgo(u.last_sync) }) : t('Nunca sincronizou')}
                    {!u.has_session ? ` · ${t('sem sessão salva')}` : u.auto ? ` · ${t('automática ligada')}` : ''}
                  </small>
                </span>
              </label>
              {st && <span className={`tag tk-st ${st[1]}`} title={u.req?.at ? new Date(u.req.at).toLocaleString(locale()) : ''}>{st[0]}</span>}
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="empty small">{t('Ninguém aqui.')}</p>}
    </section>
  );
}

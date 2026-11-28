import { useEffect, useState } from 'react';
import { adminAndroidCandidates, adminAndroidTesters, adminAndroidTestersAdd, adminAndroidTestersMark, adminAndroidTestersNotify, adminNotifyAndroidTesters } from '../lib/androidTest.js';
import { t, tErr } from '../lib/i18n.js';
import Panel from './Panel.jsx';
import { Bell, Check, Copy, Plus, Smartphone } from './Icons.jsx';

const GOAL = 12; // o Google pede 12 testadores no teste fechado antes de liberar a produção

/** Escolher pessoas para o teste: busca quem ainda não está na lista e inclui as marcadas (já com os avisos ligados). */
function AddTesters({ onAdded }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const h = setTimeout(() => adminAndroidCandidates(q).then(setList).catch((e) => setErr(tErr(e.message))), 250);
    return () => clearTimeout(h);
  }, [q]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = async () => {
    setBusy(true); setErr('');
    try { await adminAndroidTestersAdd([...sel]); setSel(new Set()); setList(await adminAndroidCandidates(q)); onAdded(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  return (
    <div className="atest-add">
      <div className="rv-label">{t('Incluir pessoas no teste')}</div>
      <input className="atest-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar por nick ou e-mail…')} />
      <div className="atest-cands">
        {(list || []).map((u) => (
          <label key={u.user_id} className="check atest-cand">
            <input type="checkbox" checked={sel.has(u.user_id)} onChange={() => toggle(u.user_id)} />
            <span><b>{u.nick}</b> <small className="muted">{u.email}{u.provider === 'google' ? '' : ` · ${t('não é conta Google')}`}</small></span>
          </label>
        ))}
        {list && !list.length && <p className="muted small">{t('Ninguém encontrado fora da lista.')}</p>}
      </div>
      <p className="muted tiny">{t('O teste da Play só aceita e-mail de conta Google (Gmail ou Google Workspace).')}</p>
      {sel.size > 0 && <button className="btn" disabled={busy} onClick={add}><Plus size={15} /> {t('Incluir {n} no teste', { n: sel.size })}</button>}
      {err && <div className="form-err">{err}</div>}
    </div>
  );
}

/**
 * Testadores do app Android: quem pediu e quem o admin incluiu. Copia os e-mails novos para o Play Console,
 * marca como adicionados e escolhe quem recebe o aviso de versão nova (pedidos novos chegam com o aviso desligado).
 */
export default function AndroidTestersAdmin() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [ver, setVer] = useState('');
  const load = () => adminAndroidTesters().then(setList).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);
  if (!list) return err ? <div className="form-err">{err}</div> : null;
  const pending = list.filter((x) => !x.added);
  const added = list.length - pending.length;
  const copy = async (rows) => {
    try { await navigator.clipboard.writeText(rows.map((x) => x.email).join(', ')); setMsg(t('{n} e-mails copiados. Cole na lista de testadores do Play Console.', { n: rows.length })); }
    catch { setMsg(t('Não consegui copiar.')); }
  };
  const mark = async (rows, v) => {
    setErr('');
    try { await adminAndroidTestersMark(rows.map((x) => x.user_id), v); await load(); setMsg(''); } catch (e) { setErr(tErr(e.message)); }
  };
  return (
    <Panel id="admin-android-testers" title={<span className="ic-row"><Smartphone size={16} /> {t('Testadores do app Android')} <span className="muted">({added}/{GOAL})</span></span>} defaultOpen={pending.length > 0}>
      <p className="muted small">{t('Na lista do Play Console: {a}. Pedidos novos: {p}. O teste fechado precisa de pelo menos {g} testadores por 14 dias.', { a: added, p: pending.length, g: GOAL })} {t('Quem você inclui entra na lista da Play em até 1 hora e recebe o link de instalação.')}</p>
      {pending.length > 0 && (
        <div className="card-actions">
          <button className="btn" onClick={() => copy(pending)}><Copy size={15} /> {t('Copiar e-mails novos')}</button>
          <button className="btn ghost" onClick={() => mark(pending, true)}><Check size={15} /> {t('Marcar todos como adicionados')}</button>
        </div>
      )}
      {list.length > 0 && pending.length === 0 && (
        <div className="card-actions"><button className="btn ghost" onClick={() => copy(list)}><Copy size={15} /> {t('Copiar todos os e-mails')}</button></div>
      )}
      <form className="atest-row" onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        try { const n = await adminNotifyAndroidTesters(ver); setMsg(t('{n} testadores avisados da versão {v} (só quem está na lista e com os avisos ligados).', { n, v: ver })); setVer(''); } catch (ex) { setErr(tErr(ex.message)); }
      }}>
        <input value={ver} onChange={(e) => setVer(e.target.value)} placeholder={t('versão publicada (ex.: 1.0.105)')} maxLength={20} required />
        <button className="btn ghost"><Bell size={15} /> {t('Avisar testadores')}</button>
      </form>
      {msg && <p className="small muted">{msg}</p>}
      {err && <div className="form-err">{err}</div>}
      <div className="atest-list">
        {list.map((x) => (
          <div key={x.user_id} className="atest-item">
            <span className="atest-who"><b>{x.nick}</b><small className="muted">{x.email}{x.by_admin ? ` · ${t('incluído pelo admin')}` : ''}</small></span>
            <button className={`atest-tag ${x.notify ? 'ok' : ''}`} title={x.notify ? t('Recebe o aviso de versão nova. Toque para desligar.') : t('Não recebe o aviso de versão nova. Toque para ligar.')}
              onClick={async () => { setErr(''); try { await adminAndroidTestersNotify([x.user_id], !x.notify); await load(); } catch (e) { setErr(tErr(e.message)); } }}>
              <Bell size={12} /> {x.notify ? t('avisos ligados') : t('avisos desligados')}
            </button>
            {x.added
              ? <button className={`atest-tag ${x.play_at ? 'ok' : 'wait'}`} title={x.play_at ? t('Tirar a marca') : t('Incluído: entra na lista da Play em até 1 hora.')} onClick={() => mark([x], false)}>{x.play_at ? t('na Play') : t('entrando na Play')}</button>
              : <button className="atest-tag" onClick={() => mark([x], true)}>{t('incluir no teste')}</button>}
          </div>
        ))}
        {!list.length && <p className="empty small">{t('Ninguém pediu ainda.')}</p>}
      </div>
      <AddTesters onAdded={load} />
    </Panel>
  );
}

import { useEffect, useState } from 'react';
import { adminAndroidTesters, adminAndroidTestersMark, adminNotifyAndroidTesters } from '../lib/androidTest.js';
import { t, tErr } from '../lib/i18n.js';
import Panel from './Panel.jsx';
import { Bell, Check, Copy, Smartphone } from './Icons.jsx';

const GOAL = 12; // o Google pede 12 testadores no teste fechado antes de liberar a produção

/** Quem pediu para testar o app Android: copia os e-mails novos para o Play Console e marca como adicionados. */
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
      <p className="muted small">{t('Na lista do Play Console: {a}. Pedidos novos: {p}. O teste fechado precisa de pelo menos {g} testadores por 14 dias.', { a: added, p: pending.length, g: GOAL })}</p>
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
        try { const n = await adminNotifyAndroidTesters(ver); setMsg(t('{n} testadores avisados da versão {v}.', { n, v: ver })); setVer(''); } catch (ex) { setErr(tErr(ex.message)); }
      }}>
        <input value={ver} onChange={(e) => setVer(e.target.value)} placeholder={t('versão publicada (ex.: 1.0.105)')} maxLength={20} required />
        <button className="btn ghost"><Bell size={15} /> {t('Avisar testadores')}</button>
      </form>
      {msg && <p className="small muted">{msg}</p>}
      {err && <div className="form-err">{err}</div>}
      <div className="atest-list">
        {list.map((x) => (
          <div key={x.user_id} className="atest-item">
            <span className="atest-who"><b>{x.nick}</b><small className="muted">{x.email}</small></span>
            {x.added
              ? <button className="atest-tag ok" title={t('Tirar a marca')} onClick={() => mark([x], false)}>{t('na lista')}</button>
              : <button className="atest-tag" onClick={() => mark([x], true)}>{t('marcar adicionado')}</button>}
          </div>
        ))}
        {!list.length && <p className="empty small">{t('Ninguém pediu ainda.')}</p>}
      </div>
    </Panel>
  );
}

import { useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import { androidTestJoin, androidTestLeave, androidTestStatus } from '../lib/androidTest.js';
import { t, tErr } from '../lib/i18n.js';
import { isNative } from '../lib/native.js';
import { Smartphone, X } from './Icons.jsx';

const HIDE = 'pumpstat:android-test-hide';
const isAndroid = () => /android/i.test(navigator.userAgent);

/**
 * Convite para testar o app Android. Na Home aparece só para quem usa Android pelo navegador (e some ao dispensar);
 * em Ajustes fica sempre disponível.
 */
export default function AndroidTestCard({ where = 'home' }) {
  const home = where === 'home';
  const { session } = useData();
  const [st, setSt] = useState(null);
  const [email, setEmail] = useState(session?.user?.email || '');
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState(() => { try { return home && localStorage.getItem(HIDE) === '1'; } catch { return false; } });
  const show = !isNative && !!session?.user && !(home && (hidden || !isAndroid()));
  useEffect(() => { if (show) androidTestStatus().then(setSt).catch(() => {}); }, [show]);
  if (!show || !st) return null;

  const dismiss = () => { try { localStorage.setItem(HIDE, '1'); } catch { /* ignore */ } setHidden(true); };
  const join = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { setSt(await androidTestJoin(email)); setEdit(false); } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };
  const leave = async () => {
    if (!window.confirm(t('Sair da lista de testes do app Android?'))) return;
    setBusy(true);
    try { await androidTestLeave(); setSt({ ...st, joined: false, added: false, email: null }); } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };

  return (
    <section className={`card atest ${home ? 'atest-home' : ''}`}>
      {home && <button type="button" className="icon-btn atest-x" aria-label={t('Agora não')} onClick={dismiss}><X size={16} /></button>}
      <h3 className="ic-row"><Smartphone size={18} /> {t('App Android do PIU Stats')}</h3>
      {(!st.joined || edit) ? (
        <form onSubmit={join}>
          <p className="small">{t('Quer testar o app antes de todo mundo? Entre na lista e instale pela Play Store. Use o e-mail da conta Google do seu celular Android.')}</p>
          <div className="atest-row">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('seu e-mail do Google')} autoComplete="email" />
            <button className="btn" disabled={busy}>{busy ? '…' : t('Quero testar')}</button>
          </div>
          {edit && <button type="button" className="link small" onClick={() => setEdit(false)}>{t('Cancelar')}</button>}
        </form>
      ) : (
        <>
          {st.added ? (
            <>
              <p className="small">{t('Você está na lista de testes com {email}.', { email: st.email })}</p>
              <ol className="small atest-steps">
                <li>{t('No celular Android, abra o convite com essa conta Google.')}</li>
                <li>{t('Toque em “Tornar-se testador”.')}</li>
                <li>{t('Instale o PIU Stats pela Play Store (pode levar alguns minutos para aparecer).')}</li>
              </ol>
            </>
          ) : (
            <p className="small">{t('Pedido recebido ({email}). Assim que você entrar na lista, é só abrir o convite no celular Android.', { email: st.email })}</p>
          )}
          <div className="atest-row">
            <a className="btn" href={st.link} target="_blank" rel="noreferrer">{t('Abrir convite')}</a>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => { setEmail(st.email || email); setEdit(true); }}>{t('Trocar e-mail')}</button>
          </div>
          {!home && <button type="button" className="link small muted" disabled={busy} onClick={leave}>{t('Sair da lista de testes')}</button>}
        </>
      )}
      {err && <div className="form-err">{err}</div>}
    </section>
  );
}

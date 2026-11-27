import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { setGuest } from '../lib/guest.js';
import { resetPassword, signIn, signInWithGoogle, signUp } from '../lib/auth.js';
import { t, tErr } from '../lib/i18n.js';
import LangPicker from '../components/LangPicker.jsx';
import { LayoutGrid, ListOrdered, Logo } from '../components/Icons.jsx';

export default function Login({ notice }) {
  const [mode, setMode] = useState('in'); // in | up | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(notice || '');
  const [err, setErr] = useState('');
  const [guestOn, setGuestOn] = useState(false);
  useEffect(() => { rpc('app_config').then((c) => setGuestOn(!!c?.guest?.enabled)).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try {
      if (mode === 'in') await signIn(email.trim(), password);
      else if (mode === 'up') {
        const s = await signUp(email.trim(), password);
        if (!s) { setMsg(t('Conta criada. Abra o link de confirmação que enviamos para o seu e-mail e depois entre aqui.')); setMode('in'); }
      } else {
        await resetPassword(email.trim());
        setMsg(t('Se o e-mail tiver conta, enviamos um link para criar uma nova senha.'));
        setMode('in');
      }
    } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-top"><div className="login-brand"><Logo size={30} /> PIU Stats</div><LangPicker compact /></div>
        <p className="muted center">{t('Seus recordes de Pump It Up e o clube num lugar só.')}</p>
        <form onSubmit={submit}>
          <label className="field">{t('E-mail')}
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'reset' && (
            <label className="field">{t('Senha')}
              <input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {err && <div className="form-err">{err}</div>}
          {msg && <div className="form-msg">{msg}</div>}
          <button className="btn wide" disabled={busy}>
            {busy ? t('Aguarde…') : mode === 'in' ? t('Entrar') : mode === 'up' ? t('Criar conta') : t('Enviar link')}
          </button>
        </form>
        {mode !== 'reset' && (
          <>
            <div className="divider"><span>{t('ou')}</span></div>
            <button type="button" className="btn google wide" onClick={signInWithGoogle}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {t('Entrar com Google')}
            </button>
          </>
        )}
        {guestOn && <button type="button" className="btn ghost wide guest-queue" onClick={() => { window.location.hash = '#/tier'; setGuest(true); }}><LayoutGrid size={17} /> {t('Ver o tier sem conta')}</button>}
        <a className="btn ghost wide guest-queue" href="#/fila"><ListOrdered size={17} /> {t('Entrar na fila como convidado')}</a>
        <p className="muted small center guest-hint">{t('Sem conta: veja as filas dos fliperamas e entre só com o seu nome.')}</p>
        <a className="link small privacy-link" href="#/privacidade">{t('Política de privacidade')}</a>
        <div className="login-links">
          {mode !== 'in' && <button className="link" onClick={() => setMode('in')}>{t('Já tenho conta')}</button>}
          {mode !== 'up' && <button className="link" onClick={() => setMode('up')}>{t('Criar conta')}</button>}
          {mode !== 'reset' && <button className="link" onClick={() => setMode('reset')}>{t('Esqueci a senha')}</button>}
        </div>
      </div>
    </div>
  );
}

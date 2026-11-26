import { useState } from 'react';
import { resetPassword, signIn, signUp } from '../lib/auth.js';

export default function Login({ notice }) {
  const [mode, setMode] = useState('in'); // in | up | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(notice || '');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try {
      if (mode === 'in') await signIn(email.trim(), password);
      else if (mode === 'up') {
        const s = await signUp(email.trim(), password);
        if (!s) { setMsg('Conta criada. Abra o link de confirmação que enviamos para o seu e-mail e depois entre aqui.'); setMode('in'); }
      } else {
        await resetPassword(email.trim());
        setMsg('Se o e-mail tiver conta, enviamos um link para criar uma nova senha.');
        setMode('in');
      }
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand"><span className="logo">▲</span> PumpStat</div>
        <p className="muted center">Seus recordes de Pump It Up Phoenix 2 e Phoenix.</p>
        <form onSubmit={submit}>
          <label className="field">E-mail
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'reset' && (
            <label className="field">Senha
              <input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {err && <div className="form-err">{err}</div>}
          {msg && <div className="form-msg">{msg}</div>}
          <button className="btn wide" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Enviar link'}
          </button>
        </form>
        <div className="login-links">
          {mode !== 'in' && <button className="link" onClick={() => setMode('in')}>Já tenho conta</button>}
          {mode !== 'up' && <button className="link" onClick={() => setMode('up')}>Criar conta</button>}
          {mode !== 'reset' && <button className="link" onClick={() => setMode('reset')}>Esqueci a senha</button>}
        </div>
      </div>
    </div>
  );
}

// Verificação em duas etapas: tela do código no login e cartão de Ajustes (cadastrar / remover o autenticador).
import { useEffect, useState } from 'react';
import { signOut } from '../lib/auth.js';
import { listFactors, removeFactor, rememberHint, sessionAal, startEnroll, verifiedFactor, verifyCode } from '../lib/mfa.js';
import { t, tErr } from '../lib/i18n.js';
import { Check, Logo, ShieldCheck } from './Icons.jsx';

const digits = (v) => String(v || '').replace(/\D/g, '').slice(0, 6);

function CodeInput({ value, onChange, autoFocus }) {
  return (
    <input className="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
      aria-label={t('Código de 6 dígitos')} autoFocus={autoFocus} value={value} onChange={(e) => onChange(digits(e.target.value))} />
  );
}

/** Depois do login: pede o código do autenticador antes de abrir o app. */
export function MfaLogin({ session, onDone }) {
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    listFactors().then((l) => {
      const f = verifiedFactor(l);
      if (!f) { rememberHint(session.user.id, false); onDone(); } else setFactor(f);
    }).catch((e) => setErr(tErr(e.message)));
  }, []); // eslint-disable-line
  const submit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) { setErr(t('Digite os 6 números do autenticador.')); return; }
    setBusy(true); setErr('');
    try { await verifyCode(factor.id, code); onDone(); } catch (ex) { setErr(tErr(ex.message)); setCode(''); }
    setBusy(false);
  };
  return (
    <div className="login">
      <form className="login-card mfa-login" onSubmit={submit}>
        <div className="login-brand"><Logo size={30} /> PIU Stats</div>
        <div className="mfa-ic"><ShieldCheck size={26} /></div>
        <h3>{t('Verificação em duas etapas')}</h3>
        <p className="muted small">{t('Abra o app autenticador e digite o código de 6 números do PIU Stats para {e}.', { e: session.email || '' })}</p>
        <CodeInput value={code} onChange={setCode} autoFocus />
        {err && <div className="form-err">{err}</div>}
        <button className="btn wide" disabled={busy || !factor}>{busy ? t('Aguarde…') : t('Confirmar e entrar')}</button>
        <button type="button" className="btn ghost wide" onClick={signOut}>{t('Sair e usar outra conta')}</button>
        <p className="muted small">{t('Perdeu o acesso ao autenticador? Fale com o suporte pelo Ajuda, no e-mail da conta.')}</p>
      </form>
    </div>
  );
}

/** Ajustes → Segurança. */
export function TwoFactorCard() {
  const [state, setState] = useState({ loading: true });
  const [enroll, setEnroll] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => listFactors().then((l) => setState({ factor: verifiedFactor(l) })).catch((e) => setState({ error: tErr(e.message) }));
  useEffect(() => { load(); }, []);

  const begin = async () => {
    setBusy(true); setErr('');
    try { setEnroll(await startEnroll()); setCode(''); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const confirm = async (e) => {
    e.preventDefault();
    if (code.length !== 6) { setErr(t('Digite os 6 números do autenticador.')); return; }
    setBusy(true); setErr('');
    try { await verifyCode(enroll.id, code); setEnroll(null); await load(); } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm(t('Desligar a verificação em duas etapas? Sua conta volta a entrar só com a senha.'))) return;
    setBusy(true); setErr('');
    try { await removeFactor(state.factor.id); await load(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };

  const on = !!state.factor;
  return (
    <section className="card mfa-card">
      <div className="mfa-head">
        <span className={`mfa-ic ${on ? 'on' : ''}`}><ShieldCheck size={20} /></span>
        <div>
          <h3>{t('Verificação em duas etapas')}</h3>
          <p className="muted small">{on ? t('Ligada: todo login pede o código do autenticador.') : t('Opcional. Além da senha, o login pede um código do app autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).')}</p>
        </div>
        {on && <span className="tag ok"><Check size={12} /> {t('Ligada')}</span>}
      </div>
      {state.loading && <p className="muted small">{t('Carregando…')}</p>}
      {state.error && <div className="form-err">{state.error}</div>}

      {!state.loading && !on && !enroll && (
        <button className="btn" disabled={busy} onClick={begin}>{busy ? t('Aguarde…') : t('Ativar verificação em duas etapas')}</button>
      )}
      {enroll && (
        <form className="mfa-enroll" onSubmit={confirm}>
          <ol className="mfa-steps small">
            <li>{t('No app autenticador, adicione uma conta lendo o QR code.')}</li>
            <li>{t('Digite abaixo o código de 6 números que aparecer.')}</li>
          </ol>
          {enroll.qr && <img className="mfa-qr" src={enroll.qr} alt={t('QR code do autenticador')} />}
          <p className="muted small mfa-secret">{t('Sem câmera? Digite a chave:')} <code>{enroll.secret}</code></p>
          <CodeInput value={code} onChange={setCode} autoFocus />
          <div className="bm-row">
            <button className="btn" disabled={busy}>{busy ? t('Aguarde…') : t('Confirmar e ativar')}</button>
            <button type="button" className="btn ghost" onClick={() => { setEnroll(null); setErr(''); }}>{t('Cancelar')}</button>
          </div>
        </form>
      )}
      {on && (
        <div className="bm-row">
          <button className="btn ghost danger" disabled={busy || sessionAal() !== 'aal2'} onClick={remove}>{t('Desligar')}</button>
        </div>
      )}
      {err && <div className="form-err">{err}</div>}
    </section>
  );
}

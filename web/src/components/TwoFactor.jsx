// Verificação em duas etapas: tela do código no login e cartão de Ajustes (cadastrar / remover o autenticador).
import { useEffect, useState } from 'react';
import { signOut } from '../lib/auth.js';
import { listFactors, markInvited, removeFactor, rememberHint, sessionAal, shouldInvite, startEnroll, verifiedFactor, verifyCode } from '../lib/mfa.js';
import { useData } from '../App.jsx';
import { quizPending, useQuiz } from '../lib/quiz.js';
import { useTour } from '../lib/tour.js';
import { t, tErr } from '../lib/i18n.js';
import { Check, Copy, ExternalLink, Logo, ShieldCheck, X } from './Icons.jsx';

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

// otpauth:// abre o app autenticador instalado (Google Authenticator, Microsoft Authenticator, 1Password…).
// No app Android a webview manda esquemas desconhecidos para o sistema; a aba do navegador (Browser.open) não abriria.
function openUri(uri) {
  window.location.href = uri;
}

/** QR code + chave + código: cadastra o autenticador e já deixa a sessão verificada. */
function EnrollForm({ onDone, onCancel }) {
  const [enroll, setEnroll] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { startEnroll().then(setEnroll).catch((e) => setErr(tErr(e.message))); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(enroll.secret); } catch {
      const i = document.createElement('textarea'); i.value = enroll.secret; document.body.appendChild(i); i.select();
      try { document.execCommand('copy'); } catch { /* ignore */ } i.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };
  const confirm = async (e) => {
    e.preventDefault();
    if (code.length !== 6) { setErr(t('Digite os 6 números do autenticador.')); return; }
    setBusy(true); setErr('');
    try { await verifyCode(enroll.id, code); onDone(); } catch (ex) { setErr(tErr(ex.message)); setBusy(false); }
  };
  return (
    <form className="mfa-enroll" onSubmit={confirm}>
      <ol className="mfa-steps small">
        <li>{t('No celular, toque em "Abrir no app autenticador". No computador, leia o QR code com o app do celular.')}</li>
        <li>{t('Digite abaixo o código de 6 números que aparecer.')}</li>
      </ol>
      {!enroll && !err && <p className="muted small">{t('Carregando…')}</p>}
      {enroll?.uri && (
        <div className="mfa-links">
          <button type="button" className="btn" onClick={() => openUri(enroll.uri)}><ExternalLink size={15} /> {t('Abrir no app autenticador')}</button>
          <button type="button" className="btn ghost" onClick={copy}><Copy size={15} /> {copied ? t('Chave copiada') : t('Copiar chave')}</button>
        </div>
      )}
      {enroll?.qr && <img className="mfa-qr" src={enroll.qr} alt={t('QR code do autenticador')} />}
      {enroll?.secret && <p className="muted small mfa-secret">{t('Ou digite a chave no app:')} <code>{enroll.secret}</code></p>}
      <CodeInput value={code} onChange={setCode} autoFocus />
      {err && <div className="form-err">{err}</div>}
      <div className="card-actions">
        <button className="btn" disabled={busy || !enroll}>{busy ? t('Aguarde…') : t('Confirmar e ativar')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('Cancelar')}</button>
      </div>
    </form>
  );
}

/** Convite (uma vez por conta) para ativar, depois do questionário e do tutorial. */
export function MfaInvite() {
  const { session, plan } = useData();
  const quiz = useQuiz();
  const tour = useTour();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState('ask'); // ask | enroll | done | later
  const uid = session?.user?.id;
  const ready = !!uid && !!plan && !plan.view_as && quiz && !quizPending(quiz) && !quiz.promptOpen && (tour.asked || plan.tour_seen) && tour.step < 0;
  useEffect(() => {
    if (!ready || show) return undefined;
    let alive = true;
    const id = setTimeout(() => { shouldInvite(uid).then((ok) => { if (alive && ok) setShow(true); }).catch(() => {}); }, 1500);
    return () => { alive = false; clearTimeout(id); };
  }, [ready, uid]); // eslint-disable-line
  if (!show) return null;
  const later = () => { markInvited(uid); setStep('later'); };
  const close = () => setShow(false);
  return (
    <div className="tour-backdrop" role="presentation">
      <div className="tour-card mfa-invite" role="dialog" aria-modal="true" aria-labelledby="mfa-inv-title">
        {(step === 'ask' || step === 'enroll') && <button type="button" className="quiz-x" onClick={later} aria-label={t('Fechar')}><X size={18} /></button>}
        {step === 'ask' && (
          <>
            <span className="mfa-ic on"><ShieldCheck size={24} /></span>
            <h3 id="mfa-inv-title">{t('Proteja sua conta')}</h3>
            <p className="small">{t('Ative a verificação em duas etapas: além da senha, o login pede um código do app autenticador do seu celular. Assim ninguém entra na sua conta só com a senha.')}</p>
            <div className="tour-actions">
              <button type="button" className="btn" onClick={() => setStep('enroll')}>{t('Ativar agora')}</button>
              <button type="button" className="btn ghost" onClick={later}>{t('Deixar para depois')}</button>
            </div>
          </>
        )}
        {step === 'enroll' && (
          <>
            <h3 id="mfa-inv-title">{t('Verificação em duas etapas')}</h3>
            <EnrollForm onDone={() => { markInvited(uid); setStep('done'); }} onCancel={() => setStep('ask')} />
          </>
        )}
        {step === 'done' && (
          <>
            <span className="mfa-ic on"><Check size={24} /></span>
            <h3 id="mfa-inv-title">{t('Verificação ativada')}</h3>
            <p className="small">{t('A partir de agora, todo login pede o código do autenticador. Você pode desligar em Ajustes → Segurança.')}</p>
            <div className="tour-actions single"><button type="button" className="btn" onClick={close}>{t('Pronto')}</button></div>
          </>
        )}
        {step === 'later' && (
          <>
            <span className="mfa-ic"><ShieldCheck size={24} /></span>
            <h3 id="mfa-inv-title">{t('Tudo bem')}</h3>
            <p className="small">{t('Não vamos perguntar de novo. Quando quiser, ative em Ajustes → Segurança.')}</p>
            <div className="tour-actions single"><button type="button" className="btn" onClick={close}>{t('Entendi')}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/** Ajustes → Segurança. */
export function TwoFactorCard() {
  const [state, setState] = useState({ loading: true });
  const [enrolling, setEnrolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => listFactors().then((l) => setState({ factor: verifiedFactor(l) })).catch((e) => setState({ error: tErr(e.message) }));
  useEffect(() => { load(); }, []);
  const remove = async () => {
    if (!window.confirm(t('Desligar a verificação em duas etapas? Sua conta volta a entrar só com a senha.'))) return;
    setBusy(true); setErr('');
    try { await removeFactor(state.factor.id); await load(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };

  const on = !!state.factor;
  return (
    <section className="card mfa-card" id="seguranca-2fa">
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
      {!state.loading && !on && !enrolling && <button className="btn" onClick={() => setEnrolling(true)}>{t('Ativar verificação em duas etapas')}</button>}
      {enrolling && <EnrollForm onDone={() => { setEnrolling(false); load(); }} onCancel={() => setEnrolling(false)} />}
      {on && (
        <div className="bm-row">
          <button className="btn ghost danger" disabled={busy || sessionAal() !== 'aal2'} onClick={remove}>{t('Desligar')}</button>
        </div>
      )}
      {err && <div className="form-err">{err}</div>}
    </section>
  );
}

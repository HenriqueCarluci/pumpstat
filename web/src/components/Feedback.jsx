import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc, SUPABASE_KEY, SUPABASE_URL } from '../lib/api.js';
import { isNative } from '../lib/native.js';
import { accessToken } from '../lib/auth.js';
import { API_URL } from '../lib/config.js';
import { getLang, t, tErr } from '../lib/i18n.js';
import { CircleCheck, ImagePlus, LifeBuoy, X } from './Icons.jsx';
import { Chips } from '../pages/Songs.jsx';

const KINDS = [['question', 'Dúvida'], ['bug', 'Problema'], ['idea', 'Sugestão'], ['other', 'Outro']];

/** Print do problema: reduz para no máximo 1280 px (JPEG) antes de enviar. */
async function shrinkShot(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}
async function uploadShot(blob, userId) {
  const token = await accessToken();
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/feedback-shots/${path}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob,
  });
  if (!res.ok) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/feedback-shots/${path}`;
}
async function appVersion() {
  if (!isNative) return null;
  try { const { App } = await import('@capacitor/app'); const i = await App.getInfo(); return `${i.version} (${i.build})`; } catch { return null; }
}

/**
 * Formulário de ajuda e feedback. Salva no Supabase e a API manda o e-mail para o suporte.
 * "Problema" pode levar um print; uma tarefa diária lê os problemas novos, corrige e avisa por notificação.
 */
export default function Feedback({ onSent } = {}) {
  const { session, version } = useData();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('question');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState(session?.email || '');
  const [withInfo, setWithInfo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [shot, setShot] = useState(null); // { blob, preview }

  const submit = async (e) => {
    e.preventDefault();
    if (message.trim().length < 3) { setErr(t('escreva uma mensagem')); return; }
    setBusy(true); setErr('');
    const meta = withInfo ? {
      page: window.location.hash, lang: getLang(), version, ua: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      build: [...document.scripts].map((s) => s.src).find((s) => s.includes('/assets/'))?.split('/assets/')[1],
      app: await appVersion(), platform: isNative ? 'android' : 'web', at: new Date().toISOString(),
    } : {};
    try {
      const shotUrl = kind === 'bug' && shot && session?.user?.id ? await uploadShot(shot.blob, session.user.id).catch(() => null) : null;
      const id = await rpc('submit_feedback', { p_kind: kind, p_message: message, p_contact: contact, p_meta: meta, p_shot: shotUrl });
      // a API manda o e-mail; se falhar, a mensagem continua salva no banco
      try {
        const token = await accessToken();
        await fetch(`${API_URL}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id, kind, message, contact, meta }),
        });
      } catch { /* ignora */ }
      setDone(kind); setMessage(''); setShot(null); onSent?.();
    } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };

  if (!open) {
    return (
      <button className="btn ghost wide" onClick={() => { setOpen(true); setDone(false); }}>
        <LifeBuoy size={16} /> {t('Falar com o suporte')}
      </button>
    );
  }
  if (done) {
    return (
      <div className="feedback-done">
        <CircleCheck size={28} />
        <div>
          <b>{t('Mensagem enviada')}</b>
          <p className="muted small">{done === 'bug'
            ? t('Obrigado! Os problemas são analisados todo dia. Quando este for corrigido, você recebe um aviso aqui no app.')
            : t('Obrigado! A resposta aparece em Meus chamados e você recebe um aviso no app.')}</p>
          {session && !onSent && <Link className="small" to="/suporte">{t('Acompanhar em Meus chamados')}</Link>}
        </div>
        <button className="btn ghost" onClick={() => { setDone(false); setOpen(false); }}>{t('Fechar')}</button>
      </div>
    );
  }
  return (
    <form className="feedback" onSubmit={submit}>
      <div className="rv-label">{t('Sobre o que é?')}</div>
      <Chips value={kind} onChange={setKind} options={KINDS.map(([k, l]) => [k, t(l)])} />
      <textarea rows={5} maxLength={2000} required value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder={kind === 'bug' ? t('O que aconteceu? Em qual tela? O que você esperava?') : t('Conte com detalhes como podemos ajudar.')} />
      {kind === 'bug' && (
        <div className="fb-shot">
          {shot ? (
            <div className="fb-shot-prev">
              <img src={shot.preview} alt={t('Print do problema')} />
              <button type="button" className="btn ghost sm" onClick={() => setShot(null)}><X size={14} /> {t('Tirar print')}</button>
            </div>
          ) : (
            <label className="btn ghost sm fb-shot-add">
              <ImagePlus size={15} /> {t('Anexar print da tela (opcional)')}
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                try { const blob = await shrinkShot(f); if (blob) setShot({ blob, preview: URL.createObjectURL(blob) }); } catch { setErr(t('Não deu para ler essa imagem. Tente um PNG ou JPG.')); }
              }} />
            </label>
          )}
        </div>
      )}
      <label className="field">{t('E-mail para resposta')}
        <input type="email" value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={withInfo} onChange={(e) => setWithInfo(e.target.checked)} />
        <span>{t('Incluir informações do aparelho e da tela (ajuda a resolver problemas)')}</span>
      </label>
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn" disabled={busy}>{busy ? t('Enviando…') : t('Enviar')}</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</button>
      </div>
    </form>
  );
}

import { useEffect, useRef, useState } from 'react';
import { rpc, SUPABASE_KEY, SUPABASE_URL } from '../lib/api.js';
import { API_URL } from '../lib/config.js';
import { accessToken } from '../lib/auth.js';
import { t, tErr } from '../lib/i18n.js';
import { ExternalLink, ImagePlus, Send, X } from './Icons.jsx';

/** Redes de um time: guardamos só o usuário (Discord: o código do convite). */
export const TEAM_SOCIALS = [
  { id: 'tiktok', label: 'TikTok', url: (h) => `https://tiktok.com/@${h}`, ph: 'time.pump' },
  { id: 'youtube', label: 'YouTube', url: (h) => `https://youtube.com/@${h}`, ph: 'canaldotime' },
  { id: 'twitch', label: 'Twitch', url: (h) => `https://twitch.tv/${h}`, ph: 'canaldotime' },
  { id: 'x', label: 'X', url: (h) => `https://x.com/${h}`, ph: 'timepump' },
  { id: 'discord', label: 'Discord', url: (h) => `https://discord.gg/${h}`, ph: 'discord.gg/convite' },
];

/** Links do Instagram e das redes do time. */
export function TeamSocialLinks({ team }) {
  if (!team) return null;
  const list = [
    team.instagram && { id: 'instagram', label: 'Instagram', href: `https://instagram.com/${team.instagram}`, h: `@${team.instagram}` },
    ...TEAM_SOCIALS.filter((n) => team.socials?.[n.id]).map((n) => ({
      id: n.id, label: n.label, href: n.url(team.socials[n.id]), h: n.id === 'discord' ? t('Entrar no servidor') : `@${team.socials[n.id]}`,
    })),
  ].filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="socials team-socials" aria-label={t('Redes do time')}>
      {list.map((n) => (
        <a key={n.id} className={`social ${n.id}`} href={n.href} target="_blank" rel="noopener noreferrer"><b>{n.label}</b><span>{n.h}</span><ExternalLink size={12} /></a>
      ))}
    </div>
  );
}

const MAX_IN = 10 * 1024 * 1024;
const SIDE = 256;

/** Recorta o centro da imagem em um quadrado de 256 px (logo leve, até ~100 KB). */
async function squareLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    if (s < 64) throw new Error(t('A imagem é pequena demais. Use pelo menos 64 × 64 pixels.'));
    const c = document.createElement('canvas');
    c.width = SIDE; c.height = SIDE;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIDE, SIDE);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.9));
    if (blob && blob.type === 'image/webp') return blob;
    return await new Promise((ok) => c.toBlob(ok, 'image/png'));
  } catch (e) {
    throw e instanceof Error && e.message ? e : new Error(t('Não deu para ler essa imagem. Tente um PNG ou JPG.'));
  } finally { URL.revokeObjectURL(url); }
}

async function uploadLogo(blob, userId) {
  const token = await accessToken();
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/team-logos/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': blob.type, 'x-upsert': 'false' },
    body: blob,
  });
  if (!res.ok) throw new Error(t('Não deu para enviar o logo. Tente de novo.'));
  return `${SUPABASE_URL}/storage/v1/object/public/team-logos/${path}`;
}

const EMPTY = { name: '', tag: '', city: '', instagram: '', socials: {}, about: '', contact: '' };

/** Formulário de pedido de time: logo, sigla, cidade, redes, sobre e contato. O admin recebe por e-mail e no painel. */
export default function TeamRequestForm({ userId, onSent, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [logo, setLogo] = useState(null); // { blob, preview }
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  useEffect(() => () => { if (logo?.preview) URL.revokeObjectURL(logo.preview); }, [logo]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setSoc = (k, v) => setForm((f) => ({ ...f, socials: { ...f.socials, [k]: v } }));

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    if (!/^image\//.test(file.type)) { setErr(t('Escolha uma imagem (PNG, JPG ou WEBP).')); return; }
    if (file.size > MAX_IN) { setErr(t('A imagem passa de 10 MB.')); return; }
    try { const blob = await squareLogo(file); setLogo({ blob, preview: URL.createObjectURL(blob) }); } catch (ex) { setErr(ex.message); }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (form.tag && !/^[A-Za-z0-9]{2,5}$/.test(form.tag)) { setErr(t('A sigla precisa ter de 2 a 5 letras ou números.')); return; }
    setBusy(true);
    try {
      const logoUrl = logo ? await uploadLogo(logo.blob, userId) : null;
      const id = await rpc('request_team_form', { p: { ...form, logo: logoUrl } });
      // a API avisa o admin por e-mail; se falhar, o pedido continua no painel
      try {
        const token = await accessToken();
        await fetch(`${API_URL}/api/team-request`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id }),
        });
      } catch { /* ignora */ }
      setForm(EMPTY); setLogo(null);
      onSent?.();
    } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };

  return (
    <form className="team-form team-request" onSubmit={submit}>
      <div className="tq-head">
        <button type="button" className={`tq-logo ${logo ? 'has' : ''}`} onClick={() => fileRef.current?.click()} aria-label={t('Escolher logo do time')}>
          {logo ? <img src={logo.preview} alt="" /> : <><ImagePlus size={22} /><small>{t('Logo')}</small></>}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickFile} />
        <div className="tq-main">
          <label className="field"><span>{t('Nome do time')} *</span>
            <input required minLength={2} maxLength={40} value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
          {logo
            ? <button type="button" className="link muted small ic-row" onClick={() => setLogo(null)}><X size={12} /> {t('Tirar logo')}</button>
            : <p className="muted tiny">{t('Logo opcional: PNG, JPG ou WEBP. Cortamos no centro em quadrado.')}</p>}
        </div>
      </div>
      <div className="row2">
        <label className="field"><span>{t('Sigla')}</span>
          <input maxLength={5} placeholder={t('ex.: LBD')} value={form.tag} onChange={(e) => set('tag', e.target.value.toUpperCase())} /></label>
        <label className="field"><span>{t('Cidade')}</span>
          <input maxLength={60} value={form.city} onChange={(e) => set('city', e.target.value)} /></label>
      </div>
      <label className="field"><span>Instagram</span>
        <input maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="@time.pump"
          value={form.instagram} onChange={(e) => set('instagram', e.target.value)} /></label>
      {!more
        ? <button type="button" className="link small" onClick={() => setMore(true)}>{t('+ Outras redes (TikTok, YouTube, Twitch, X, Discord)')}</button>
        : (
          <div className="se-grid">
            {TEAM_SOCIALS.map((n) => (
              <label key={n.id} className="field"><span>{n.label}</span>
                <input maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={n.ph}
                  value={form.socials[n.id] || ''} onChange={(e) => setSoc(n.id, e.target.value)} /></label>
            ))}
          </div>
        )}
      <label className="field"><span>{t('Sobre o time')}</span>
        <textarea rows={3} maxLength={500} placeholder={t('Onde vocês jogam, há quanto tempo, quem pode entrar…')}
          value={form.about} onChange={(e) => set('about', e.target.value)} /></label>
      <label className="field"><span>{t('Contato para o admin (opcional)')}</span>
        <input maxLength={120} placeholder={t('WhatsApp ou e-mail')} value={form.contact} onChange={(e) => set('contact', e.target.value)} /></label>
      <p className="muted tiny">{t('O admin recebe o pedido e confere. Quando aprovar, você entra no time automaticamente.')}</p>
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button className="btn ic-row" type="submit" disabled={busy}><Send size={14} /> {busy ? t('Enviando…') : t('Enviar pedido')}</button>
        <button type="button" className="link muted" onClick={onCancel}>{t('Cancelar')}</button>
      </div>
    </form>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { AtSign, Check, Copy, ExternalLink } from './Icons.jsx';

/** Redes do perfil: guardamos só o nome de usuário; o link é montado aqui. */
export const SOCIALS = [
  { id: 'instagram', label: 'Instagram', url: (h) => `https://instagram.com/${h}`, ph: 'seu.usuario' },
  { id: 'twitch', label: 'Twitch', url: (h) => `https://twitch.tv/${h}`, ph: 'seucanal' },
  { id: 'youtube', label: 'YouTube', url: (h) => `https://youtube.com/@${h}`, ph: 'seucanal' },
  { id: 'tiktok', label: 'TikTok', url: (h) => `https://tiktok.com/@${h}`, ph: 'seu.usuario' },
  { id: 'x', label: 'X', url: (h) => `https://x.com/${h}`, ph: 'seuusuario' },
  { id: 'discord', label: 'Discord', url: null, ph: 'seuusuario' },
];

/** Links das redes de um jogador (só aparecem se ele deixou visível para você). */
export function SocialLinks({ userId, me = false }) {
  const [s, setS] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    rpc('socials_of', { p_user: userId }).then((r) => alive && setS(r || {})).catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  const list = SOCIALS.filter((n) => s?.[n.id]);
  if (!list.length) {
    return me && s
      ? <Link to="/ajustes?s=redes" className="socials-add small ic-row"><AtSign size={14} /> {t('Adicione suas redes sociais para aparecerem no seu perfil')}</Link>
      : null;
  }
  const copy = async (v) => { try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sem clipboard */ } };
  return (
    <section className="socials" aria-label={t('Redes sociais')}>
      {list.map((n) => (n.url
        ? <a key={n.id} className={`social ${n.id}`} href={n.url(s[n.id])} target="_blank" rel="noopener noreferrer"><b>{n.label}</b><span>@{s[n.id]}</span><ExternalLink size={12} /></a>
        : (
          <button key={n.id} type="button" className={`social ${n.id}`} onClick={() => copy(s[n.id])} title={t('Copiar usuário do Discord')}>
            <b>{n.label}</b><span>{s[n.id]}</span>{copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )))}
    </section>
  );
}

/** Ajustes: preencher as redes e escolher quem vê. */
export function SocialsEditor() {
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc('my_socials').then((r) => setForm(r || { visibility: 'friends' })).catch((e) => setMsg(tErr(e.message))); }, []);
  // vindo do perfil (?s=redes): rola até aqui
  useEffect(() => {
    if (form && /[?&]s=redes/.test(window.location.hash)) setTimeout(() => document.getElementById('redes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }, [!!form]); // eslint-disable-line
  if (!form) return null;
  const save = async () => {
    setBusy(true); setMsg('');
    try { setForm(await rpc('set_socials', { p: form })); setMsg(t('Salvo')); } catch (e) { setMsg(tErr(e.message)); } finally { setBusy(false); }
  };
  return (
    <section className="card socials-edit" id="redes">
      <h3 className="ic-row"><AtSign size={18} /> {t('Redes sociais')}</h3>
      <p className="muted small">{t('Opcional. Seus amigos podem entrar no seu perfil e te seguir. Coloque só o nome de usuário (ou cole o link).')}</p>
      <div className="se-grid">
        {SOCIALS.map((n) => (
          <label key={n.id} className="field">
            <span>{n.label}</span>
            <input type="text" maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={n.ph}
              value={form[n.id] || ''} onChange={(e) => setForm((f) => ({ ...f, [n.id]: e.target.value }))} />
          </label>
        ))}
      </div>
      <label className="field">
        <span>{t('Quem pode ver')}</span>
        <select value={form.visibility || 'friends'} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}>
          <option value="friends">{t('Só meus amigos')}</option>
          <option value="all">{t('Todos os jogadores')}</option>
          <option value="hidden">{t('Ninguém (esconder)')}</option>
        </select>
      </label>
      <div className="bm-row">
        <button className="btn" disabled={busy} onClick={save}>{t('Salvar')}</button>
        {msg && <span className="muted small ic-row">{msg === t('Salvo') && <Check size={14} />} {msg}</span>}
      </div>
    </section>
  );
}

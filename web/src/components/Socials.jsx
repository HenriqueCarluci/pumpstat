import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { AtSign, Check } from './Icons.jsx';
import { BRAND } from './brandIcons.js';

/** Redes do perfil: guardamos só o nome de usuário; o link é montado aqui. */
export const SOCIALS = [
  { id: 'instagram', label: 'Instagram', url: (h) => `https://instagram.com/${h}`, ph: 'seu.usuario' },
  { id: 'twitch', label: 'Twitch', url: (h) => `https://twitch.tv/${h}`, ph: 'seucanal' },
  { id: 'youtube', label: 'YouTube', url: (h) => `https://youtube.com/@${h}`, ph: 'seucanal' },
  { id: 'tiktok', label: 'TikTok', url: (h) => `https://tiktok.com/@${h}`, ph: 'seu.usuario' },
  { id: 'x', label: 'X', url: (h) => `https://x.com/${h}`, ph: 'seuusuario' },
  { id: 'discord', label: 'Discord', url: null, ph: 'seuusuario' },
];

/** Ícone da rede (SVG do Simple Icons). */
export function BrandIcon({ id, size = 18 }) {
  const b = BRAND[id];
  if (!b) return null;
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ color: b.color }}><path d={b.path} fill="currentColor" /></svg>;
}

/**
 * Redes de um jogador como ícones (só aparecem se ele deixou visível para você). Toque abre o perfil na rede;
 * o Discord não tem link público, então o toque copia o usuário. No próprio perfil sem redes, um atalho para preencher.
 */
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
      ? <Link to="/ajustes?s=redes" className="socials-add small ic-row"><AtSign size={14} /> {t('Adicionar redes sociais')}</Link>
      : null;
  }
  const copy = async (v) => { try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sem clipboard */ } };
  return (
    <div className="socials-ic" aria-label={t('Redes sociais')}>
      {list.map((n) => (n.url
        ? <a key={n.id} className="soc-ic" href={n.url(s[n.id])} target="_blank" rel="noopener noreferrer"
            aria-label={`${n.label}: @${s[n.id]}`} title={`${n.label} · @${s[n.id]}`}><BrandIcon id={n.id} /></a>
        : <button key={n.id} type="button" className="soc-ic" onClick={() => copy(s[n.id])}
            aria-label={t('Copiar usuário do Discord')} title={`${n.label} · ${s[n.id]}`}><BrandIcon id={n.id} /></button>))}
      {copied && <span className="soc-copied" role="status"><Check size={12} /> {t('Discord copiado: {u}', { u: s.discord })}</span>}
    </div>
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

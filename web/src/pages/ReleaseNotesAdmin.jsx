// Admin → Novidades: cria e edita as notas de lançamento e os próximos lançamentos.
import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { fmtDay, NOTE_TAGS, reloadNotes } from '../components/ReleaseNotes.jsx';
import { Chips } from './Songs.jsx';
import { Plus, Trash2 } from '../components/Icons.jsx';

const LANG_TABS = [['pt', 'Português'], ['en', 'English'], ['es', 'Español']];
const EMPTY = { status: 'released', tag: 'new', released_on: '', title: {}, body: {}, published: true, sort: 0 };

export default function ReleaseNotesAdmin() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const load = () => rpc('admin_release_notes').then((r) => setList(r || [])).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);
  const saved = async () => { setEdit(null); await load(); reloadNotes(); };
  return (
    <section className="card">
      <div className="row-between">
        <h3>{t('Novidades do app')}</h3>
        <button type="button" className="btn" onClick={() => setEdit({ ...EMPTY })}><Plus size={15} /> {t('Nova')}</button>
      </div>
      <p className="muted small">{t('Aparecem em Ajustes → Novidades e num aviso no início para quem ainda não viu. Rascunhos ficam só aqui.')}</p>
      {err && <div className="form-err">{err}</div>}
      {edit && <NoteForm key={edit.id || 'new'} note={edit} onCancel={() => setEdit(null)} onSaved={saved} />}
      {!list && !err && <p className="empty">{t('Carregando…')}</p>}
      {['released', 'soon'].map((st) => {
        const items = (list || []).filter((n) => n.status === st);
        if (!items.length) return null;
        return (
          <div key={st}>
            <div className="rv-label">{st === 'soon' ? t('Próximos') : t('Lançados')}</div>
            <ul className="rn-admin">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className="rn-admin-row" onClick={() => setEdit(n)}>
                    <span className={`rn-tag ${st === 'soon' ? 'soon' : n.tag}`}>{st === 'soon' ? t('Em breve') : t(NOTE_TAGS[n.tag])}</span>
                    <b>{n.title?.pt}</b>
                    <small className="muted">{n.published ? (n.released_on ? fmtDay(n.released_on) : '') : t('rascunho')}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function NoteForm({ note, onCancel, onSaved }) {
  const [n, setN] = useState({ ...EMPTY, ...note, title: { ...note.title }, body: { ...note.body } });
  const [lang, setLang] = useState('pt');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch) => setN((x) => ({ ...x, ...patch }));
  const save = async () => {
    setBusy(true); setErr('');
    try { await rpc('admin_save_release_note', { p: { ...n, id: n.id || null } }); await onSaved(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const del = async () => {
    if (!window.confirm(t('Apagar esta novidade? Não dá para desfazer.'))) return;
    setBusy(true);
    try { await rpc('admin_delete_release_note', { p_id: n.id }); await onSaved(); } catch (e) { setErr(tErr(e.message)); setBusy(false); }
  };
  return (
    <div className="rn-form">
      <Chips value={n.status} onChange={(v) => set({ status: v })} options={[['released', t('Lançado')], ['soon', t('Próximo')]]} />
      {n.status === 'released' && <>
        <Chips value={n.tag} onChange={(v) => set({ tag: v })} options={Object.entries(NOTE_TAGS).map(([k, l]) => [k, t(l)])} />
        <label className="small">{t('Data do lançamento')} <input type="date" value={n.released_on || ''} onChange={(e) => set({ released_on: e.target.value })} /></label>
      </>}
      {n.status === 'soon' && <label className="small">{t('Ordem (menor aparece primeiro)')} <input type="number" value={n.sort} onChange={(e) => set({ sort: Number(e.target.value) || 0 })} /></label>}
      <Chips value={lang} onChange={setLang} options={LANG_TABS.map(([k, l]) => [k, l + (n.title[k] ? ' ✓' : '')])} />
      <input placeholder={lang === 'pt' ? t('Título (obrigatório)') : t('Título (opcional; sem ele vale o português)')} maxLength={120}
        value={n.title[lang] || ''} onChange={(e) => set({ title: { ...n.title, [lang]: e.target.value } })} />
      <textarea rows={3} maxLength={1500} placeholder={t('O que muda para quem usa (curto e direto)')}
        value={n.body[lang] || ''} onChange={(e) => set({ body: { ...n.body, [lang]: e.target.value } })} />
      <label className="check"><input type="checkbox" checked={!n.published} onChange={(e) => set({ published: !e.target.checked })} /> <span>{t('Rascunho (não aparece no app)')}</span></label>
      {err && <div className="form-err">{err}</div>}
      <div className="bm-row">
        <button type="button" className="btn" disabled={busy || !n.title.pt?.trim()} onClick={save}>{t('Salvar')}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>{t('Cancelar')}</button>
        {n.id && <button type="button" className="btn ghost danger" disabled={busy} onClick={del}><Trash2 size={15} /> {t('Apagar')}</button>}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/api.js';
import { getPosition, listVenues } from '../lib/queue.js';
import { t, tErr } from '../lib/i18n.js';
import { Check, MapPin, Plus, Trash2 } from './Icons.jsx';

const STATUS = { pending: 'Esperando aprovação', approved: 'Aprovado', rejected: 'Não aprovado' };

/** Membro sugere um fliperama com Pump; entra na lista depois que o admin aprova. */
export default function VenueRequest() {
  const [open, setOpen] = useState(false); // false | 'add' | 'remove'
  const [venues, setVenues] = useState([]);
  const [rm, setRm] = useState({ slug: '', reason: '' });
  const [mine, setMine] = useState([]);
  const [f, setF] = useState({ name: '', city: '', address: '', machines: 1, machine_names: '', note: '', lat: null, lng: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const load = () => rpc('my_venue_requests').then(setMine).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const locate = async () => {
    setErr('');
    try { const p = await getPosition(); setF((x) => ({ ...x, lat: p.lat, lng: p.lng })); } catch (e) { setErr(tErr(e.message)); }
  };
  const openRemove = () => {
    setOpen('remove'); setOk(false); setErr('');
    if (!venues.length) listVenues().then(setVenues).catch(() => {});
  };
  const sendRemove = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await rpc('request_venue_removal', { p_slug: rm.slug, p_reason: rm.reason });
      setOk(true); setOpen(false); setRm({ slug: '', reason: '' }); load();
    } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await rpc('request_venue', { p_name: f.name, p_city: f.city, p_address: f.address, p_lat: f.lat, p_lng: f.lng,
        p_machines: Number(f.machines) || 1, p_machine_names: f.machine_names, p_note: f.note });
      setOk(true); setOpen(false); setF({ name: '', city: '', address: '', machines: 1, machine_names: '', note: '', lat: null, lng: null }); load();
    } catch (ex) { setErr(tErr(ex.message)); }
    setBusy(false);
  };

  return (
    <section className="card venue-req">
      {!open ? (
        <div className="venue-req-btns">
          <button className="btn ghost wide" onClick={() => { setOpen('add'); setOk(false); }}><Plus size={16} /> {t('Cadastrar um fliperama com Pump')}</button>
          <button className="link small muted ic-row" onClick={openRemove}><Trash2 size={14} /> {t('Pedir para tirar um fliperama da lista')}</button>
        </div>
      ) : open === 'remove' ? (
        <form className="venue-form" onSubmit={sendRemove}>
          <h3>{t('Tirar fliperama da lista')}</h3>
          <p className="muted small">{t('Use quando o lugar fechou ou não tem mais Pump. O admin confere antes de tirar.')}</p>
          <select required value={rm.slug} onChange={(e) => setRm({ ...rm, slug: e.target.value })}>
            <option value="">{t('Escolha o fliperama')}</option>
            {venues.map((v) => <option key={v.slug} value={v.slug}>{v.name} · {v.city}</option>)}
          </select>
          <textarea required minLength={5} maxLength={500} rows={2} placeholder={t('Motivo (ex.: fechou, a máquina saiu)')} value={rm.reason} onChange={(e) => setRm({ ...rm, reason: e.target.value })} />
          {err && <div className="form-err">{err}</div>}
          <div className="bm-row">
            <button className="btn" type="submit" disabled={busy}>{busy ? t('Enviando…') : t('Enviar para aprovação')}</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</button>
          </div>
        </form>
      ) : (
        <form className="venue-form" onSubmit={send}>
          <h3>{t('Cadastrar fliperama')}</h3>
          <p className="muted small">{t('Mande os dados do lugar. O admin confere e, se estiver tudo certo, ele entra na lista com fila.')}</p>
          <input required minLength={2} maxLength={80} placeholder={t('Nome do lugar')} value={f.name} onChange={set('name')} />
          <div className="row2">
            <input required minLength={2} maxLength={60} placeholder={t('Cidade')} value={f.city} onChange={set('city')} />
            <input type="number" min={1} max={20} title={t('Quantas máquinas de Pump')} value={f.machines} onChange={set('machines')} />
          </div>
          <input maxLength={200} placeholder={t('Endereço')} value={f.address} onChange={set('address')} />
          <input maxLength={300} placeholder={t('Nome das máquinas (opcional, separados por vírgula)')} value={f.machine_names} onChange={set('machine_names')} />
          <div className="ic-row small">
            <button type="button" className="btn ghost" onClick={locate}><MapPin size={15} /> {t('Usar minha localização (estou no lugar)')}</button>
            {f.lat != null && <span className="muted ic-row"><Check size={14} /> {t('localização marcada')}</span>}
          </div>
          <textarea maxLength={500} rows={2} placeholder={t('Observações (horário, andar, preço da ficha…)')} value={f.note} onChange={set('note')} />
          {err && <div className="form-err">{err}</div>}
          <div className="bm-row">
            <button className="btn" type="submit" disabled={busy}>{busy ? t('Enviando…') : t('Enviar para aprovação')}</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</button>
          </div>
        </form>
      )}
      {ok && <p className="small ic-row"><Check size={14} /> {t('Pedido enviado! Você recebe uma notificação quando o admin analisar.')}</p>}
      {mine.length > 0 && (
        <div className="small venue-mine">
          <b>{t('Seus pedidos')}</b>
          {mine.slice(0, 5).map((r) => (
            <div key={r.id} className={`vr-${r.status}`}>
              {r.kind === 'remove' && <span className="tag">{t('exclusão')}</span>} {r.venue && r.kind !== 'remove' ? <Link to={`/fila/${r.venue}`}>{r.name}</Link> : r.name} · {r.city} · <span className="muted">{t(STATUS[r.status])}{r.admin_note ? `: ${r.admin_note}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

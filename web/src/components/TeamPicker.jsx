import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { forgetTeam } from '../lib/teams.jsx';
import { t, tErr } from '../lib/i18n.js';
import { Check, Users } from './Icons.jsx';

/** Seu time: escolhe um da lista ou pede o cadastro de um novo (o admin aprova). */
export default function TeamPicker({ userId }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('view'); // view | pick | request
  const [form, setForm] = useState({ name: '', tag: '', city: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const load = () => rpc('list_teams').then(setData).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);

  const pick = async (id) => {
    setErr('');
    try { await rpc('set_my_team', { p_team: id }); if (userId) forgetTeam(userId); setMode('view'); setMsg(id ? t('Time salvo.') : t('Você saiu do time.')); load(); } catch (e) { setErr(tErr(e.message)); }
  };
  const request = async (e) => {
    e.preventDefault(); setErr('');
    if (form.tag && !/^[A-Za-z0-9]{2,5}$/.test(form.tag)) { setErr(t('A sigla precisa ter de 2 a 5 letras ou números.')); return; }
    try {
      await rpc('request_team', { p_name: form.name, p_tag: form.tag, p_city: form.city });
      setMode('view'); setMsg(t('Pedido enviado. Você entra no time assim que o admin aprovar.')); setForm({ name: '', tag: '', city: '' }); load();
    } catch (ex) { setErr(tErr(ex.message)); }
  };

  if (!data) return <section className="card"><h3>{t('Seu time')}</h3><p className="muted small">{err || t('Carregando…')}</p></section>;
  const list = data.teams.filter((x) => !q || `${x.name} ${x.tag || ''} ${x.city || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="card team-card">
      <h3 className="ic-row"><Users size={18} /> {t('Seu time')}</h3>
      {data.mine
        ? <p><b>{data.mine.name}</b>{data.mine.tag && <span className="team-tag">{data.mine.tag}</span>}</p>
        : <p className="muted small">{t('Você ainda não está em nenhum time.')}</p>}
      {data.pending && (
        <p className="small muted">
          {data.pending.status === 'pending'
            ? t('Pedido do time {name} esperando aprovação do admin.', { name: data.pending.name })
            : t('O time {name} não foi aprovado', { name: data.pending.name }) + (data.pending.admin_note ? `: ${data.pending.admin_note}` : '.')}
        </p>
      )}
      {msg && <p className="small ic-row"><Check size={14} /> {msg}</p>}
      {err && <div className="form-err">{err}</div>}

      {mode === 'view' && (
        <div className="bm-row">
          <button className="btn ghost" onClick={() => { setMode('pick'); setMsg(''); }}>{data.mine ? t('Trocar de time') : t('Escolher time')}</button>
          {!data.pending || data.pending.status !== 'pending' ? <button className="link" onClick={() => { setMode('request'); setMsg(''); }}>{t('Pedir cadastro de time novo')}</button> : null}
          {data.mine && <button className="link muted" onClick={() => pick(null)}>{t('Sair do time')}</button>}
        </div>
      )}

      {mode === 'pick' && (
        <div className="team-pick">
          <input placeholder={t('Buscar time…')} value={q} onChange={(e) => setQ(e.target.value)} />
          {!data.teams.length && <p className="muted small">{t('Ainda não há times cadastrados. Peça o cadastro do seu.')}</p>}
          <div className="team-list">
            {list.map((x) => (
              <button key={x.id} className={`team-opt ${data.mine?.id === x.id ? 'on' : ''}`} onClick={() => pick(x.id)}>
                <b>{x.name}</b>{x.tag && <span className="team-tag">{x.tag}</span>}
                <small className="muted">{[x.city, t('{n} membros', { n: x.members })].filter(Boolean).join(' · ')}</small>
              </button>
            ))}
          </div>
          <div className="bm-row">
            <button className="link" onClick={() => setMode('request')}>{t('Meu time não está na lista')}</button>
            <button className="link muted" onClick={() => setMode('view')}>{t('Cancelar')}</button>
          </div>
        </div>
      )}

      {mode === 'request' && (
        <form className="team-form" onSubmit={request}>
          <input required minLength={2} maxLength={40} placeholder={t('Nome do time')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="row2">
            <input maxLength={5} placeholder={t('Sigla (ex.: LBD)')} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} />
            <input maxLength={60} placeholder={t('Cidade')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <p className="muted tiny">{t('O admin confere o pedido. Quando aprovar, você entra no time automaticamente.')}</p>
          <div className="bm-row">
            <button className="btn" type="submit">{t('Enviar pedido')}</button>
            <button type="button" className="link muted" onClick={() => setMode('view')}>{t('Cancelar')}</button>
          </div>
        </form>
      )}
    </section>
  );
}

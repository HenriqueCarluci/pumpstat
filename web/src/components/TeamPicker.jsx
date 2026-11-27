import { useEffect, useState } from 'react';
import { rpc } from '../lib/api.js';
import { forgetTeam, TeamLogo } from '../lib/teams.jsx';
import { t, tErr } from '../lib/i18n.js';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Check, ChevronRight, Crown, LogOut, Plus, Users } from './Icons.jsx';
import TeamRequestForm, { TeamSocialLinks } from './TeamRequestForm.jsx';

/** Seu time: escolhe um da lista ou pede o cadastro de um novo (o admin aprova). */
export default function TeamPicker({ userId }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('view'); // view | pick | request
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const load = () => rpc('list_teams').then(setData).catch((e) => setErr(tErr(e.message)));
  useEffect(() => { load(); }, []);

  const pick = async (id) => {
    setErr('');
    try {
      const r = await rpc('set_my_team', { p_team: id });
      if (userId) forgetTeam(userId);
      setMode('view');
      const name = data.teams.find((x) => x.id === id)?.name || '';
      setMsg(!id ? t('Você saiu do time.') : r?.status === 'pending'
        ? t('Pedido enviado aos administradores do {name}. Você entra no time assim que aprovarem.', { name })
        : t('Time salvo.'));
      load();
    } catch (e) { setErr(tErr(e.message)); }
  };
  const cancelRequest = async () => {
    setErr('');
    try { await rpc('cancel_team_request'); setMsg(t('Pedido cancelado.')); load(); } catch (e) { setErr(tErr(e.message)); }
  };

  if (!data) return <section className="card"><h3>{t('Seu time')}</h3><p className="muted small">{err || t('Carregando…')}</p></section>;
  const list = data.teams.filter((x) => !q || `${x.name} ${x.tag || ''} ${x.city || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="card team-card">
      <h3 className="ic-row"><Users size={18} /> {t('Seu time')}</h3>
      {data.mine
        ? <Link to="/time" className="team-mine">
            {data.mine.logo && <TeamLogo team={data.mine} size={44} />}
            <span className="team-mine-txt">
              <b>{data.mine.name}</b>
              <span className="team-mine-tags">
                {data.mine.tag && <span className="team-tag">{data.mine.tag}</span>}
                {data.mine.admin && <span className="tag team-admin-tag"><Crown size={11} /> {t('Administrador')}</span>}
              </span>
            </span>
            <ChevronRight size={18} className="muted" />
          </Link>
        : <p className="muted small">{t('Você ainda não está em nenhum time.')}</p>}
      {data.mine && <TeamSocialLinks team={data.mine} />}
      {data.requested && (
        <p className="small team-requested">
          {t('Pedido para entrar no {name} esperando os administradores do time.', { name: data.requested.name })}
          {' '}<button className="link" onClick={cancelRequest}>{t('Cancelar pedido')}</button>
        </p>
      )}
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
        <div className="card-actions">
          <button className="btn ghost" onClick={() => { setMode('pick'); setMsg(''); }}><ArrowLeftRight size={15} /> {data.mine ? t('Trocar de time') : t('Escolher time')}</button>
          {!data.pending || data.pending.status !== 'pending' ? <button className="btn ghost" onClick={() => { setMode('request'); setMsg(''); }}><Plus size={15} /> {t('Pedir time novo')}</button> : null}
          {data.mine && <button className="btn ghost danger-text" onClick={() => pick(null)}><LogOut size={15} /> {t('Sair do time')}</button>}
        </div>
      )}

      {mode === 'pick' && (
        <div className="team-pick">
          <input placeholder={t('Buscar time…')} value={q} onChange={(e) => setQ(e.target.value)} />
          {!data.teams.length && <p className="muted small">{t('Ainda não há times cadastrados. Peça o cadastro do seu.')}</p>}
          <div className="team-list">
            {list.map((x) => (
              <button key={x.id} className={`team-opt ${data.mine?.id === x.id ? 'on' : ''}`} onClick={() => pick(x.id)}>
                {x.logo && <TeamLogo team={x} size={28} />}<b>{x.name}</b>{x.tag && <span className="team-tag">{x.tag}</span>}
                <small className="muted">{[x.city, t('{n} membros', { n: x.members }), x.approval && data.mine?.id !== x.id ? t('entrada com aprovação') : null].filter(Boolean).join(' · ')}</small>
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
        <TeamRequestForm userId={userId} onCancel={() => setMode('view')}
          onSent={() => { setMode('view'); setMsg(t('Pedido enviado. Você entra no time assim que o admin aprovar.')); load(); }} />
      )}
    </section>
  );
}

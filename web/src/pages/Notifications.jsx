import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { Grade, Jacket, timeAgo } from '../components/ui.jsx';
import { canAlert, describe, linkFor } from '../lib/notify.js';
import { Chips } from './Songs.jsx';
import { t } from '../lib/i18n.js';
import { ChevronRight } from '../components/Icons.jsx';

export default function Notifications() {
  const { notifications: nt } = useData();
  const [filter, setFilter] = useState('all');
  const [perm, setPerm] = useState(canAlert() ? Notification.permission : 'unsupported');
  // marca como lidas ao sair da tela, para o destaque das novas continuar visível agora
  useEffect(() => () => { nt.markSeen(); }, []); // eslint-disable-line

  const items = nt.items.filter((n) => filter === 'all'
    || (filter === 'friends' && n.kind !== 'new_song') || (filter === 'songs' && n.kind === 'new_song'));

  const ask = async () => { try { setPerm(await Notification.requestPermission()); } catch { /* ignora */ } };

  return (
    <div className="page">
      <h2>{t('Notificações')}</h2>
      {perm === 'default' && (
        <div className="banner">
          {t('Quer receber um aviso no aparelho quando um amigo bater recorde ou sair música nova?')}
          <button className="btn" onClick={ask}>{t('Ativar avisos')}</button>
        </div>
      )}
      <Chips value={filter} onChange={setFilter} options={[['all', t('Tudo')], ['friends', t('Amigos')], ['songs', t('Músicas novas')]]} />
      {!nt.loaded && <p className="empty">{t('Carregando…')}</p>}
      {nt.loaded && !items.length && (
        <p className="empty">{t('Nada por aqui ainda. Quando seus amigos sincronizarem recordes novos ou sair música nova no catálogo, aparece aqui.')} <Link to="/jogadores" className="ic-row">{t('Amigos')} <ChevronRight size={14} /></Link></p>
      )}
      <div className="notifs">
        {items.map((n, i) => (
          <Link key={i} to={linkFor(n)} className={`notif ${n.unread ? 'unread' : ''}`}>
            {n.jacket ? <Jacket song={{ title: n.title, jacket: n.jacket }} width={64} />
              : <span className="q-avatar" style={{ width: 44, height: 44 }}>{n.avatar ? <img src={n.avatar} alt="" referrerPolicy="no-referrer" /> : (n.nickname || '?').slice(0, 2)}</span>}
            <div className="notif-main">
              <div>{describe(n)}</div>
              <small className="muted">{timeAgo(n.at)}{n.kind === 'friend_score' && n.version === 'phoenix' ? ' · Phoenix' : ''}</small>
            </div>
            {n.kind === 'friend_score' && <Grade grade={n.grade} size="sm" />}
          </Link>
        ))}
      </div>
      <p className="muted tiny">{t('Os recordes dos amigos aparecem quando eles sincronizam a conta da Pump. Músicas novas entram quando o catálogo é atualizado (uma vez por dia).')}</p>
    </div>
  );
}

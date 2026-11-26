// Início: destaque dos desafios do mês abertos.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { isOn } from '../lib/plans.js';
import { goalText } from '../lib/challenges.js';
import { t } from '../lib/i18n.js';
import { ChevronRight, Gift, Trophy } from './Icons.jsx';

export default function ChallengeBanner() {
  const { plan, data } = useData();
  const on = isOn(plan, 'challenges');
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!on) return;
    rpc('list_challenges').then((l) => setList(l.filter((c) => c.status === 'live'))).catch(() => {});
  }, [on, data.lastSync]);
  if (!on || !list?.length) return null;
  return (
    <Link to="/desafios" className="card ch-banner">
      <Trophy size={22} />
      <div className="ch-banner-main">
        <b>{list.length > 1 ? t('{n} desafios do mês abertos', { n: list.length }) : list[0].title}</b>
        {list.slice(0, 2).map((c) => (
          <div key={c.id} className="small">
            {list.length > 1 && <span className="muted">{c.title}: </span>}
            {c.joined ? `${goalText(c)} · ${Math.min(c.progress, c.goal)}/${c.goal}` : goalText(c)}
            {c.prize && <span className="muted"> · <Gift size={12} /> {c.prize}</span>}
          </div>
        ))}
        {list.some((c) => !c.joined) && <span className="small ch-banner-cta">{t('Toque para participar')}</span>}
      </div>
      <ChevronRight size={18} />
    </Link>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrainingAddChip } from '../components/TrainingToggle.jsx';
import { useData } from '../App.jsx';
import PlanLock from '../components/PlanLock.jsx';
import { Ball, Grade, Jacket } from '../components/ui.jsx';
import { chartTier, fmtScore, TIERS } from '../lib/piu.js';
import { recommendations } from '../lib/recommend.js';
import { chartTagLabel, tagColor } from '../lib/tags.js';
import { Chips } from './Songs.jsx';
import { fmtNum, t } from '../lib/i18n.js';
import { entitlements } from '../lib/plans.js';

export default function Recommend() {
  const { data, version, plan } = useData();
  const [mode, setMode] = useState('all');
  const [tab, setTab] = useState('fresh');
  const rec = useMemo(() => recommendations(version, data.charts), [version, data]);
  const ent = entitlements(plan);
  const full = (tab === 'fresh' ? rec.fresh : rec.improve).filter((r) => mode === 'all' || r.chart.mode === mode).slice(0, 40);
  const locked = !ent.can('recommendations_all');
  const list = locked ? full.slice(0, 3) : full;

  return (
    <div className="page">
      <h2>{t('Recomendadas para você')}</h2>
      <p className="muted small">
        PUMBILITY {fmtNum(Math.round(rec.total))}
        {' · '}{rec.full ? t('um chart novo precisa valer mais de {v} para entrar no seu top 50.', { v: rec.floor.toFixed(1) }) : t('seu top 50 ainda não está cheio, qualquer chart nível 10+ soma.')}{' '}
        {t('A nota esperada vem das suas notas em charts do mesmo nível, ajustada pela dificuldade de cada chart.')}
      </p>
      <Chips value={tab} onChange={setTab} options={[['fresh', `${t('Para jogar')} (${rec.fresh.length})`], ['improve', `${t('Melhorar recorde')} (${rec.improve.length})`]]} />
      <Chips value={mode} onChange={setMode} options={[['all', t('Todos')], ['S', 'Single'], ['D', 'Double']]} />

      {!list.length && <p className="empty">{data.charts.some((c) => c.score != null) ? t('Nada aqui por enquanto. Jogue mais alguns charts de nível 10+ para eu entender seu nível.') : t('Sincronize suas notas para receber recomendações.')}</p>}

      <PlanLock feature="recommendations_all" title={t('Recomendações para subir PUMBILITY')}>
      <div className="recs">
        {list.map((r) => {
          const c = r.chart;
          const tier = TIERS.find((x) => x.id === chartTier(c));
          return (
            <div key={c.id} className="rc">
              <Link to={`/chart/${c.id}`} className="rc-top">
                <div className="rc-jk"><Jacket song={c.song} width={112} /><span className="rc-ball"><Ball chart={c} size="sm" /></span></div>
                <div className="rc-info">
                  <b className="rc-title">{c.song.title}</b>
                  <div className="rc-tags">
                    {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{t(tier.label)}</span>}
                    {(c.tagBars || []).slice(0, 3).map(([x, v]) => <span key={x} className="st-chip" style={{ '--c': tagColor(x) }}>{t(chartTagLabel(x))} {v}%</span>)}
                  </div>
                </div>
                <div className="rc-gain"><b>+{r.gain.toFixed(1)}</b><small>PUMBILITY</small></div>
              </Link>
              <div className="rc-foot">
                {tab === 'fresh'
                  ? <div className="rc-exp"><small>{t('Nota esperada')}</small><b>~{fmtScore(Math.round(r.expected / 1000) * 1000)}</b><Grade grade={r.grade} size="sm" /></div>
                  : <div className="rc-exp"><small>{t('Recorde')}</small><b>{fmtScore(c.score)}</b><small>{t('faltam {n}', { n: fmtScore(r.need) })}</small><Grade grade={r.grade} size="sm" /></div>}
                <TrainingAddChip chart={c} />
              </div>
            </div>
          );
        })}
      </div>
      </PlanLock>
    </div>
  );
}

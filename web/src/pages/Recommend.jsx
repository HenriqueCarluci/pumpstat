import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrainingAddChip } from '../components/TrainingToggle.jsx';
import { useData } from '../App.jsx';
import { Ball, Grade, Jacket } from '../components/ui.jsx';
import { chartTier, fmtScore, TIERS } from '../lib/piu.js';
import { recommendations } from '../lib/recommend.js';
import { topStyles, useStyles } from '../lib/style.js';
import { Chips } from './Songs.jsx';
import { fmtNum, t } from '../lib/i18n.js';
import { entitlements } from '../lib/plans.js';
import { Crown } from '../components/Icons.jsx';

export default function Recommend() {
  const { data, version, plan } = useData();
  const [mode, setMode] = useState('all');
  const [tab, setTab] = useState('fresh');
  const rec = useMemo(() => recommendations(version, data.charts), [version, data]);
  const ent = entitlements(plan);
  const full = (tab === 'fresh' ? rec.fresh : rec.improve).filter((r) => mode === 'all' || r.chart.mode === mode).slice(0, 40);
  const cap = ent.can('recommendations_all') ? null : ent.limit('recommendations');
  const list = cap != null ? full.slice(0, cap) : full;
  const styleOf = useStyles(list.map((r) => r.chart.songId));

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

      <div className="recs">
        {list.map((r) => {
          const c = r.chart;
          const tier = TIERS.find((x) => x.id === chartTier(c));
          return (
            <div key={c.id} className="rec-wrap">
            <Link to={`/musica/${c.songId}?c=${c.id}`} className="rec">
              <Jacket song={c.song} width={84} />
              <div className="rec-main">
                <div className="title">{c.song.title}</div>
                <div className="rec-line">
                  <Ball chart={c} size="sm" />
                  {tab === 'fresh'
                    ? <span className="muted small">{t('esperado ~{n}', { n: fmtScore(Math.round(r.expected / 1000) * 1000) })}</span>
                    : <span className="muted small">{fmtScore(c.score)} · {t('faltam {n}', { n: fmtScore(r.need) })}</span>}
                  <Grade grade={r.grade} size="sm" />
                  {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{t(tier.label)}</span>}
                </div>
                <div className="rec-style">
                  {topStyles(styleOf(c)).map((k) => <span key={k.id} className="st-chip" style={{ '--c': k.color }}>{t(k.label)} {Math.round(k.v)}%</span>)}
                </div>
              </div>
              <div className="rec-gain"><b>+{r.gain.toFixed(1)}</b><small>PUMBILITY</small></div>
            </Link>
            <div className="rec-actions"><TrainingAddChip chart={c} /></div>
            </div>
          );
        })}
      </div>
      {cap != null && full.length > cap && (
        <div className="card upsell">
          <b className="ic-row"><Crown size={16} /> {t('Mais {n} recomendações no Plus', { n: full.length - cap })}</b>
          <p className="muted small">{t('No plano grátis aparecem as {n} primeiras.', { n: cap })}</p>
          {ent.showPlans && <Link className="btn" to="/planos">{t('Ver planos')}</Link>}
        </div>
      )}
    </div>
  );
}

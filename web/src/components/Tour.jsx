import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { endTour, goTour, markTourAsked, startTour, TOUR_STEPS, useTour } from '../lib/tour.js';
import { t } from '../lib/i18n.js';
import {
  Dumbbell, HomeIcon, LayoutGrid, ListOrdered, Music2, RefreshCw, SettingsIcon, Shield, Sparkles, TrendingUp, Users, X,
} from './Icons.jsx';

const ICONS = { home: HomeIcon, sync: RefreshCw, music: Music2, tier: LayoutGrid, training: Dumbbell, progress: TrendingUp, friends: Users, team: Shield, queue: ListOrdered, settings: SettingsIcon };

/** Convite do primeiro acesso + cartão do tutorial guiado (por cima da tela, acima da barra de baixo). */
export default function Tour() {
  const { plan, session } = useData();
  const tour = useTour();
  const navigate = useNavigate();
  const steps = TOUR_STEPS.filter((s) => !s.toggle || isOn(plan, s.toggle));
  const step = tour.step >= 0 ? steps[tour.step] : null;
  useEffect(() => { if (step) navigate(step.route); }, [tour.step]); // eslint-disable-line

  if (!session) return null;
  if (!tour.asked && tour.step < 0) {
    return (
      <div className="tour-backdrop" role="presentation">
        <div className="tour-card welcome" role="dialog" aria-modal="true" aria-labelledby="tour-w">
          <Sparkles size={28} className="tour-ico" />
          <h3 id="tour-w">{t('Bem-vindo ao PIU Stats!')}</h3>
          <p className="small">{t('Quer um tour rápido pelas telas principais? Leva cerca de um minuto, e você pode pular quando quiser.')}</p>
          <div className="tour-actions">
            <button type="button" className="btn" onClick={startTour}>{t('Fazer o tour')}</button>
            <button type="button" className="btn ghost" onClick={markTourAsked}>{t('Agora não')}</button>
          </div>
          <p className="muted tiny">{t('Dá para ver depois em Ajustes → Ver tutorial.')}</p>
        </div>
      </div>
    );
  }
  if (!step) return null;
  const Ico = ICONS[step.icon] || Sparkles;
  const last = tour.step === steps.length - 1;
  return (
    <div className="tour-float" role="dialog" aria-live="polite" aria-label={t('Tutorial')}>
      <div className="tour-card">
        <div className="tour-top">
          <span className="tour-ico-wrap"><Ico size={18} /></span>
          <b>{t(step.title)}</b>
          <span className="muted tiny tour-count">{tour.step + 1}/{steps.length}</span>
          <button type="button" className="btn ghost icon" onClick={endTour} aria-label={t('Fechar tutorial')}><X size={15} /></button>
        </div>
        <p className="small">{t(step.text)}</p>
        <div className="tour-dots" aria-hidden="true">{steps.map((s, i) => <span key={i} className={i === tour.step ? 'on' : ''} />)}</div>
        <div className="tour-actions">
          {tour.step > 0 ? <button type="button" className="btn ghost" onClick={() => goTour(tour.step - 1)}>{t('Voltar')}</button> : <button type="button" className="btn ghost" onClick={endTour}>{t('Pular')}</button>}
          <button type="button" className="btn" onClick={() => (last ? endTour() : goTour(tour.step + 1))}>{last ? t('Concluir') : t('Próximo')}</button>
        </div>
      </div>
    </div>
  );
}

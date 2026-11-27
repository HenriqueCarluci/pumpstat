import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { adsConfig, loadAdsense, logAd, pickHouse, isAdsense } from '../lib/ads.js';
import { openExternal } from '../lib/native.js';
import { entitlements } from '../lib/plans.js';
import { t } from '../lib/i18n.js';
import { ChevronRight } from './Icons.jsx';

/** Espaço de anúncio. Só aparece no plano grátis quando o admin liga os anúncios. */
export default function AdSlot({ place, seed = 0, force = false }) {
  const { plan } = useData();
  const ads = adsConfig(plan);
  if (!ads.show && !force) return null;
  if (isAdsense(ads)) return <AdsenseUnit ads={ads} place={place} />;
  const ad = pickHouse(ads, seed + place.length) || (force ? plusAd() : null);
  if (!ad) return null;
  return <HouseAd ad={ad} place={place} showPlans={entitlements(plan).showPlans} />;
}

// anúncio de reserva (quando não há nenhum anúncio próprio ativo): o próprio Plus
const plusAd = () => ({ id: 'plus', title: 'PIU Stats Plus', text: t('Sincronize sem anúncio e veja todas as estatísticas e recomendações.'), cta: t('Ver planos'), url: '#/planos' });

function HouseAd({ ad, place, showPlans }) {
  const nav = useNavigate();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { logAd(ad.id, 'view', place); return undefined; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { logAd(ad.id, 'view', place); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad.id, place]);

  const open = (e) => {
    e.preventDefault();
    logAd(ad.id, 'click', place);
    const url = ad.url || '';
    if (url.startsWith('#/')) nav(url.slice(1));
    else if (/^https?:\/\//.test(url)) openExternal(url);
  };

  return (
    <aside ref={ref} className="ad-slot house">
      <span className="ad-label">{t('Patrocinado')}</span>
      <a href={ad.url || '#'} onClick={open} className="ad-body" rel="noreferrer sponsored">
        {ad.image && <img src={ad.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
        <span className="ad-txt">
          <b>{ad.title}</b>
          {ad.text && <small>{ad.text}</small>}
        </span>
        {ad.cta && <span className="ad-cta">{ad.cta} <ChevronRight size={14} /></span>}
      </a>
      {showPlans && ad.id !== 'plus' && <Link to="/planos" className="ad-remove">{t('Remover anúncios')}</Link>}
    </aside>
  );
}

function AdsenseUnit({ ads, place }) {
  const ref = useRef(null);
  useEffect(() => {
    let done = false;
    loadAdsense(ads.adsense_client).then(() => {
      if (done || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* bloqueador de anúncios */ }
    }).catch(() => {});
    return () => { done = true; };
  }, [ads.adsense_client, ads.adsense_slot]);
  return (
    <aside className="ad-slot adsense" data-place={place}>
      <span className="ad-label">{t('Publicidade')}</span>
      <ins ref={ref} className="adsbygoogle" style={{ display: 'block' }}
        data-ad-client={ads.adsense_client} data-ad-slot={ads.adsense_slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}

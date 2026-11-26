import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { distanceM, getPosition, listVenues } from '../lib/queue.js';
import { t, tErr } from '../lib/i18n.js';
import { MapPin, PadArrow } from '../components/Icons.jsx';
import VenueRequest from '../components/VenueRequest.jsx';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { getSession } from '../lib/auth.js';

const CITY_ORDER = ['Natal', 'Fortaleza', 'São Paulo', 'Porto Alegre', 'Recife'];
const ACCENTS = ['#ff4fd8', '#2bd2ff', '#ffd23f', '#8cff3a', '#ff9f2f'];

/** Escolha da cidade e do fliperama (mesma organização do Fila Pump). */
export default function Venues() {
  const { plan } = useData() || {};
  const [venues, setVenues] = useState(null);
  const [city, setCity] = useState(null);
  const [error, setError] = useState('');
  const [near, setNear] = useState(null); // lista por distância
  const [locating, setLocating] = useState(false);
  const last = (() => { try { return localStorage.getItem('stepclub:venue'); } catch { return null; } })();

  useEffect(() => { listVenues().then(setVenues).catch((e) => setError(tErr(e.message))); }, []);

  if (error && !venues) return <div className="page"><p className="empty">{error}</p></div>;
  if (!venues) return <div className="page"><p className="empty">{t('Carregando…')}</p></div>;

  const cities = [...new Set(venues.map((v) => v.city))].sort((a, b) => (CITY_ORDER.indexOf(a) + 99 * (CITY_ORDER.indexOf(a) < 0)) - (CITY_ORDER.indexOf(b) + 99 * (CITY_ORDER.indexOf(b) < 0)));
  const accent = (c) => ACCENTS[cities.indexOf(c) % ACCENTS.length];
  const lastVenue = venues.find((v) => v.slug === last);
  const fmtKm = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
  const findNear = async () => {
    setLocating(true); setError('');
    try {
      const p = await getPosition();
      setNear(venues.filter((v) => v.latitude != null)
        .map((v) => ({ ...v, dist: distanceM(p, { lat: v.latitude, lng: v.longitude }) }))
        .sort((a, b) => a.dist - b.dist).slice(0, 8));
    } catch (e) { setError(tErr(e.message)); }
    setLocating(false);
  };

  return (
    <div className="page venues">
      <div className="v-title"><span className="v-arrows"><PadArrow dir="ul" /><PadArrow dir="ur" /></span><h1>{t('Fila').toUpperCase()}</h1><span className="v-arrows"><PadArrow dir="dl" /><PadArrow dir="dr" /></span></div>
      {lastVenue && !city && (
        <Link to={`/fila/${lastVenue.slug}`} className="v-last">{t('Voltar para')} <b>{lastVenue.name}</b> · {lastVenue.city}</Link>
      )}
      <button className="btn ghost wide" onClick={findNear} disabled={locating}>{locating ? t('Procurando…') : <><MapPin size={16} /> {t('Pumps perto de mim')}</>}</button>
      {near && (
        <div className="v-near">
          {near.map((v) => (
            <Link key={v.slug} to={`/fila/${v.slug}`} className="v-item">
              <span><b>{v.name}</b><small>{v.address}</small></span>
              <em className={v.dist <= v.radius_m ? 'here' : ''}>{v.dist <= v.radius_m ? t('você está aqui') : fmtKm(v.dist)}</em>
            </Link>
          ))}
        </div>
      )}
      {!city ? (
        <>
          <p className="muted center">{t('Escolha a sua cidade')}</p>
          <div className="v-grid">
            {cities.map((c) => (
              <button key={c} className="v-btn" style={{ '--accent': accent(c) }} onClick={() => setCity(c)}>{c.toUpperCase()}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button className="link" onClick={() => setCity(null)}>‹ {t('Cidades')}</button>
          <p className="muted center">{city}: {t('escolha o fliperama')}</p>
          <div className="v-grid">
            {venues.filter((v) => v.city === city).map((v) => (
              <Link key={v.slug} className="v-btn" style={{ '--accent': accent(city) }} to={`/fila/${v.slug}`}>
                {v.name.toUpperCase()}
                {v.address && <small className="v-addr">{v.address}</small>}
              </Link>
            ))}
          </div>
        </>
      )}
      {error && <div className="form-err center">{error}</div>}
      {getSession() && isOn(plan, 'venue_requests') && <VenueRequest />}
      <p className="muted small center">{t('Filas baseadas no')} <a href="https://fila-pump.pages.dev" target="_blank" rel="noreferrer">Fila Pump</a> (K4L1zinha / Octg Natal). {t('Endereços:')} <a href="https://zenius-i-vanisher.com" target="_blank" rel="noreferrer">Zenius -I- vanisher</a>.</p>
    </div>
  );
}

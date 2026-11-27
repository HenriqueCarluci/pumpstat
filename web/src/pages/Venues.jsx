import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { distanceM, getPosition, listVenues, myRecentVenues, venuesSummary } from '../lib/queue.js';
import { recentVenueSlugs } from '../lib/presence.js';
import { t, tErr } from '../lib/i18n.js';
import { History, Map as MapIcon, MapPin, PadArrow } from '../components/Icons.jsx';
import VenueRequest from '../components/VenueRequest.jsx';
import VenueMap from '../components/VenueMap.jsx';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { getSession } from '../lib/auth.js';

const CITY_ORDER = ['Natal', 'Fortaleza', 'São Paulo', 'Porto Alegre', 'Recife'];
const ACCENTS = ['#ff4fd8', '#2bd2ff', '#ffd23f', '#8cff3a', '#ff9f2f'];

const GEO_SKIP = 'stepclub:geo-skip';

/**
 * Fila: primeiro pede a localização e mostra as Pumps mais perto. Quem não quiser dar a localização escolhe pela
 * cidade, com o aviso de que para entrar na fila o check-in confere a localização.
 */
export default function Venues() {
  const { plan } = useData() || {};
  const [venues, setVenues] = useState(null);
  const [city, setCity] = useState(null);
  const [error, setError] = useState('');
  const [near, setNear] = useState(null); // lista por distância
  const [locating, setLocating] = useState(false);
  const [me, setMe] = useState(null);
  const [showMap, setShowMap] = useState(false);
  // ask: pergunta | near: com localização | list: sem localização (por cidade)
  const [stage, setStage] = useState(() => { try { return sessionStorage.getItem(GEO_SKIP) ? 'list' : 'ask'; } catch { return 'ask'; } });
  const last = (() => { try { return localStorage.getItem('stepclub:venue'); } catch { return null; } })();

  const [summary, setSummary] = useState({});
  const [recent, setRecent] = useState([]);
  useEffect(() => { listVenues().then(setVenues).catch((e) => setError(tErr(e.message))); }, []);
  useEffect(() => {
    const load = () => venuesSummary().then((x) => setSummary(x || {})).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    if (getSession()) myRecentVenues().then((x) => setRecent((x || []).map((v) => v.slug))).catch(() => {});
    return () => clearInterval(id);
  }, []);

  const findNear = async (list = venues) => {
    setLocating(true); setError('');
    try {
      const p = await getPosition();
      setMe(p);
      setNear(list.filter((v) => v.latitude != null)
        .map((v) => ({ ...v, dist: distanceM(p, { lat: v.latitude, lng: v.longitude }) }))
        .sort((a, b) => a.dist - b.dist).slice(0, 8));
      setStage('near');
      try { sessionStorage.removeItem(GEO_SKIP); } catch { /* ignora */ }
    } catch (e) {
      setError(tErr(e.message));
      setStage('list');
    }
    setLocating(false);
  };
  // quem já liberou a localização antes não precisa ver a pergunta de novo
  useEffect(() => {
    if (!venues || stage !== 'ask' || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: 'geolocation' }).then((r) => { if (r.state === 'granted') findNear(venues); }).catch(() => {});
  }, [venues]); // eslint-disable-line
  const skip = () => { try { sessionStorage.setItem(GEO_SKIP, '1'); } catch { /* ignora */ } setStage('list'); };

  if (error && !venues) return <div className="page"><p className="empty">{error}</p></div>;
  if (!venues) return <div className="page"><p className="empty">{t('Carregando…')}</p></div>;

  const cities = [...new Set(venues.map((v) => v.city))].sort((a, b) => (CITY_ORDER.indexOf(a) + 99 * (CITY_ORDER.indexOf(a) < 0)) - (CITY_ORDER.indexOf(b) + 99 * (CITY_ORDER.indexOf(b) < 0)));
  const accent = (c) => ACCENTS[cities.indexOf(c) % ACCENTS.length];
  // onde a pessoa jogou: check-ins da conta + fliperamas abertos neste aparelho
  const recentList = [...new Set([...recent, ...recentVenueSlugs(), ...(last ? [last] : [])])]
    .map((slug) => venues.find((v) => v.slug === slug)).filter(Boolean).slice(0, 4);
  const Wait = ({ slug }) => {
    const q = summary[slug];
    if (!q) return null;
    return q.waiting > 0
      ? <span className="v-wait">{t('{n} na fila · ~{m} min', { n: q.waiting, m: q.wait_min })}</span>
      : <span className="v-wait free">{t('sem fila')}</span>;
  };
  const fmtKm = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

  return (
    <div className="page venues">
      <div className="v-title"><span className="v-arrows"><PadArrow dir="ul" /><PadArrow dir="ur" /></span><h1>{t('Fila').toUpperCase()}</h1><span className="v-arrows"><PadArrow dir="dl" /><PadArrow dir="dr" /></span></div>
      {recentList.length > 0 && !city && (
        <section className="v-recent">
          <h3 className="ic-row"><History size={16} /> {t('Onde você jogou')}</h3>
          <div className="v-near">
            {recentList.map((v) => (
              <Link key={v.slug} to={`/fila/${v.slug}`} className="v-item">
                <span><b>{v.name}</b><small>{v.city}</small></span>
                <Wait slug={v.slug} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {stage === 'ask' && (
        <section className="card v-ask">
          <span className="v-ask-ic"><MapPin size={26} /></span>
          <h3>{t('Encontre a Pump mais perto')}</h3>
          <p className="small">{t('Use a sua localização para ver os fliperamas mais próximos. Ela também é usada no check-in para entrar na fila. Só conferimos a distância; a localização não fica salva.')}</p>
          <button className="btn wide" onClick={() => findNear()} disabled={locating}>{locating ? t('Procurando…') : <><MapPin size={16} /> {t('Usar minha localização')}</>}</button>
          <button className="btn ghost wide" onClick={skip} disabled={locating}>{t('Escolher sem localização')}</button>
        </section>
      )}

      {stage === 'near' && near && (
        <>
          <div className="row-between v-near-h">
            <h3>{t('Perto de você')}</h3>
            <button className={`btn ghost sm ${showMap ? 'on' : ''}`} onClick={() => setShowMap((x) => !x)}><MapIcon size={15} /> {showMap ? t('Esconder mapa') : t('Ver no mapa')}</button>
          </div>
          {showMap && <VenueMap venues={venues} me={me} focus={near.map((v) => v.slug)} />}
          <div className="v-near">
            {near.map((v) => (
              <Link key={v.slug} to={`/fila/${v.slug}`} className="v-item">
                <span><b>{v.name}</b><small>{v.city}{v.address ? ` · ${v.address}` : ''}</small><Wait slug={v.slug} /></span>
                <em className={v.dist <= v.radius_m ? 'here' : ''}>{v.dist <= v.radius_m ? t('você está aqui') : fmtKm(v.dist)}</em>
              </Link>
            ))}
          </div>
          <button className="link center v-all" onClick={() => setStage('list')}>{t('Ver todas as cidades')}</button>
        </>
      )}

      {stage === 'list' && (
        <>
          <div className="v-geo-note small">
            <MapPin size={15} />
            <span>{t('Sem a localização, escolha pela cidade. Para entrar na fila, o check-in pede a localização para conferir se você está no fliperama.')}</span>
            {!near && <button className="link" onClick={() => findNear()} disabled={locating}>{locating ? t('Procurando…') : t('Usar localização')}</button>}
          </div>
          {!city ? (
            <>
              <p className="muted center">{t('Escolha a sua cidade')}</p>
              <div className="v-grid">
                {cities.map((c) => (
                  <button key={c} className="v-btn" style={{ '--accent': accent(c) }} onClick={() => setCity(c)}>{c.toUpperCase()}</button>
                ))}
              </div>
              <button className={`btn ghost wide ${showMap ? 'on' : ''}`} onClick={() => setShowMap((x) => !x)}><MapIcon size={16} /> {showMap ? t('Esconder mapa') : t('Ver no mapa')}</button>
              {showMap && <VenueMap venues={venues} me={me} />}
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
                    <Wait slug={v.slug} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {error && <div className="form-err center">{error}</div>}
      {getSession() && isOn(plan, 'venue_requests') && <VenueRequest />}
      <p className="muted small center">{t('Filas baseadas no')} <a href="https://fila-pump.pages.dev" target="_blank" rel="noreferrer">Fila Pump</a> (K4L1zinha / Octg Natal). {t('Endereços:')} <a href="https://zenius-i-vanisher.com" target="_blank" rel="noreferrer">Zenius -I- vanisher</a>.</p>
    </div>
  );
}

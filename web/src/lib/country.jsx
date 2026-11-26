// País do jogador: bandeira ao lado do nick (opcional; a pessoa escolhe em Ajustes).
import { useEffect, useState } from 'react';
import { rpc } from './api.js';
import { locale } from './i18n.js';

const cache = new Map(); // userId -> "BR" | null
let pending = null;
const wanted = new Set();

function flush() {
  const ids = [...wanted].filter((id) => !cache.has(id));
  wanted.clear();
  pending = null;
  if (!ids.length) return Promise.resolve();
  return rpc('countries_of', { p_users: ids.slice(0, 200) }).then((rows) => {
    const m = new Map((rows || []).map(([id, cc]) => [id, cc]));
    for (const id of ids) cache.set(id, m.get(id) || null);
  }).catch(() => {});
}

/** userId -> código do país para uma lista de usuários (busca em lote). */
export function useCountries(ids) {
  const key = (ids || []).filter(Boolean).sort().join(',');
  const [, setTick] = useState(0);
  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.some((id) => !cache.has(id))) return;
    list.forEach((id) => wanted.add(id));
    if (!pending) pending = new Promise((r) => setTimeout(r, 30)).then(flush);
    pending.then(() => setTick((x) => x + 1));
  }, [key]);
  return (id) => cache.get(id) || null;
}
export const setCachedCountry = (id, cc) => cache.set(id, cc || null);

let names = null;
export function countryName(cc) {
  try { names = names || new Intl.DisplayNames([locale()], { type: 'region' }); return names.of(cc) || cc; } catch { return cc; }
}

/** Bandeira (SVG do pacote flag-icons, MIT, guardado em /flags; no Windows o emoji de bandeira vira letras). */
export function Flag({ cc, size = 16 }) {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return null;
  return (
    <img className="flag" src={`${import.meta.env.BASE_URL}flags/${cc.toLowerCase()}.svg`} width={Math.round(size * 1.4)} height={size}
      alt={cc} title={countryName(cc)} loading="lazy" />
  );
}

/** Países para escolher (ISO 3166-1), com o nome no idioma do app. */
const CODES = ('AR BO BR CA CL CO CR CU DO EC SV GT HN MX NI PA PY PE PR UY US VE ' +
  'DE AT BE BG HR DK ES EE FI FR GR HU IE IS IT LV LT LU MT NL NO PL PT CZ RO RU GB SK SI SE CH UA TR ' +
  'AU NZ JP KR KP CN TW HK MO SG MY TH VN PH ID IN PK BD KZ UZ MN ' +
  'ZA EG MA NG KE AO MZ IL AE SA QA KW JO LB IR IQ').split(' ');
export function countryOptions() {
  return CODES.map((cc) => [cc, countryName(cc)]).sort((a, b) => a[1].localeCompare(b[1], locale()));
}
/** Sugestão pelo idioma do aparelho (pt-BR → BR). */
export function guessCountry() {
  const tag = (navigator.languages || [navigator.language || ''])[0] || '';
  const r = (tag.split('-')[1] || '').toUpperCase();
  return CODES.includes(r) ? r : null;
}

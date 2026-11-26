// Fila das máquinas: leitura via REST, ações via RPC e atualização em tempo real (Supabase Realtime).
import { rpc } from './api.js';
import { accessToken } from './auth.js';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { isNative, nativePosition } from './native.js';

/** Token deste aparelho: identifica a vaga de quem entra na fila sem conta. */
export function deviceToken() {
  try {
    let t = localStorage.getItem('stepclub:device');
    if (!t) { t = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('stepclub:device', t); }
    return t;
  } catch { return null; }
}

async function rest(path) {
  const token = await accessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export const venueData = (slug) => rpc('venue_data', { p_slug: slug });
export const listVenues = () => rest('venues?select=slug,name,city,address,latitude,longitude,radius_m,sort&active=eq.true&order=sort,name');
export const queueEntries = (machineIds) =>
  machineIds.length ? rest(`queue_entries?machine_id=in.(${machineIds.join(',')})&order=pos`) : Promise.resolve([]);
export const recentEvents = (machineIds) =>
  machineIds.length ? rest(`queue_events?machine_id=in.(${machineIds.join(',')})&order=at.desc&limit=8`) : Promise.resolve([]);

/** Posição atual do aparelho (para o check-in). */
export async function getPosition() {
  if (isNative) {
    try { return await nativePosition(); } catch (e) {
      throw new Error(e.code === 1 || /denied|permission/i.test(e.message || '')
        ? 'Permita o acesso à localização para fazer check-in (o PIU Stats só confere se você está no fliperama).'
        : 'Não consegui pegar sua localização. Tente de novo perto de uma janela ou com o GPS ligado.');
    }
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este aparelho não informa a localização.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1
        ? 'Permita o acesso à localização para fazer check-in (o PIU Stats só confere se você está no fliperama).'
        : 'Não consegui pegar sua localização. Tente de novo perto de uma janela ou com o GPS ligado.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

export function distanceM(a, b) {
  const R = 6371000; const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function withPosition(needsCheckin) {
  return needsCheckin ? getPosition() : { lat: null, lng: null, acc: null };
}

export const joinQueue = async (machine, name, needsCheckin) => {
  const p = await withPosition(needsCheckin);
  return rpc('queue_checkin', { p_machine: machine, p_name: name || null, p_token: deviceToken(), p_lat: p.lat, p_lng: p.lng, p_acc: p.acc });
};
export const backFromAway = async (entry, needsCheckin) => {
  const p = await withPosition(needsCheckin);
  return rpc('queue_back', { p_entry: entry, p_token: deviceToken(), p_lat: p.lat, p_lng: p.lng, p_acc: p.acc });
};
export const passTurn = (machine) => rpc('queue_pass', { p_machine: machine });
export const setAway = (entry, away) => rpc('queue_set_away', { p_entry: entry, p_away: away, p_token: deviceToken() });
export const leaveQueue = (entry) => rpc('queue_leave', { p_entry: entry, p_token: deviceToken() });
export const toFront = (entry) => rpc('queue_to_front', { p_entry: entry });
export const resetQueue = (machine) => rpc('queue_reset', { p_machine: machine });

/** Avisa quando a fila muda. Devolve a função para cancelar. */
export function subscribeQueue(machineIds, onChange) {
  let channel = null; let client = null; let stopped = false;
  (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    if (stopped) return;
    client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const filter = `machine_id=in.(${machineIds.join(',')})`;
    channel = client.channel(`fila-${machineIds.join('-')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter }, () => onChange())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_events', filter }, () => onChange())
      .subscribe();
  })().catch(() => { /* sem tempo real: o polling cobre */ });
  return () => { stopped = true; if (channel && client) client.removeChannel(channel); };
}

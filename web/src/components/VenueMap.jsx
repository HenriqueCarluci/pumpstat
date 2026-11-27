import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../lib/i18n.js';

/**
 * Mapa dos fliperamas com Pump (Leaflet + mapa escuro da CARTO/OpenStreetMap, sem chave de API).
 * Com a sua posição, centraliza em você e nos locais mais perto; sem ela, mostra todos.
 */
export default function VenueMap({ venues, me, focus }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
      if (!alive || !box.current) return;
      if (!map.current) {
        map.current = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19, subdomains: 'abcd',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(map.current);
      }
      if (layer.current) layer.current.remove();
      layer.current = L.layerGroup().addTo(map.current);
      const pin = (cls) => L.divIcon({ className: `vm-pin ${cls}`, html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
      const pts = [];
      for (const v of venues) {
        if (v.latitude == null) continue;
        const ll = [v.latitude, v.longitude];
        pts.push(ll);
        const el = document.createElement('div');
        el.className = 'vm-pop';
        const b = document.createElement('b'); b.textContent = v.name; el.appendChild(b);
        if (v.address) { const s = document.createElement('small'); s.textContent = v.address; el.appendChild(s); }
        const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = t('Abrir fila');
        btn.onclick = () => nav(`/fila/${v.slug}`);
        el.appendChild(btn);
        L.marker(ll, { icon: pin(focus?.includes(v.slug) ? 'near' : '') }).bindPopup(el).addTo(layer.current);
      }
      if (me) L.marker([me.lat, me.lng], { icon: pin('me'), zIndexOffset: 1000 }).bindPopup(t('Você está aqui')).addTo(layer.current);
      // enquadra: você + os mais perto; senão, todos os locais
      const near = me && focus?.length ? venues.filter((v) => focus.slice(0, 4).includes(v.slug) && v.latitude != null).map((v) => [v.latitude, v.longitude]) : [];
      const frame = me ? [[me.lat, me.lng], ...near] : pts;
      if (frame.length === 1) map.current.setView(frame[0], 13);
      else if (frame.length) map.current.fitBounds(frame, { padding: [28, 28], maxZoom: 14 });
      setTimeout(() => map.current?.invalidateSize(), 50);
    })().catch(() => {});
    return () => { alive = false; };
  }, [venues, me, focus, nav]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  return <div ref={box} className="venue-map" role="region" aria-label={t('Mapa dos fliperamas com Pump')} />;
}

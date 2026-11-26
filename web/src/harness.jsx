// Só para desenvolvimento: renderiza a página da música com dados de exemplo (não entra no build).
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { DataCtx } from './App.jsx';
import Song from './pages/Song.jsx';
import Tier from './pages/Tier.jsx';
import { useState } from 'react';
import { PlanMatrix } from './pages/AdminExtra.jsx';
import { Attempts } from './pages/Training.jsx';
import { Flag } from './lib/country.jsx';
function F() { return <div className="page"><div className="card">{['BR','US','KR','JP','MX','CL','AR','PT','FR','GB'].map((c) => <div key={c} style={{ padding: 6 }}><Flag cc={c} /><b>Jogador {c}</b></div>)}</div></div>; }
const D = 86400000; const now = Date.now();
const hist = [700000, 720000, 740000, 760000, 780000, 905000, 912000].map((sc, i) => ({ at: now - (20 - i * 3) * D, score: sc, grade: sc > 900000 ? 'AA' : 'A', broken: sc < 900000, miss: 30 - i * 3 }));
function A() { return <div className="page"><div className="train-item"><Attempts x={{ history: hist, added: now - 10 * D, clearedInTraining: true, cleared: true, triesSince: 3, failsSince: 1 }} /></div></div>; }
function M() { const [cfg, setCfg] = useState({ features: { weakness: 'pro' }, limits: { free: { friends: 15, recommendations: 5, history_months: 3 }, plus: { friends: 50 } } }); const set = (fn) => setCfg((c) => { const n = structuredClone(c); fn(n); return n; }); return <div className="page"><PlanMatrix cfg={cfg} set={set} /></div>; }
import './styles.css';

const song = { id: 242, title: 'Gargoyle', artist: 'Sanxion7', bpm: '150', songType: 'Arcade', jacket: 'https://piugame.com/data/song_img2/618150bb862eb2a3177d94ac387aae60.png', rise: false, isNew: true, charts: [] };
const rows = [[7487, 'D', 14, 'ESC', 681, ['Runs', 'Sustained', 'Twists'], 'Overrated', 'Medium', 14.09], [5769, 'D', 20, 'SANDSTORM', 1189, ['Runs', 'Runs Without Twists', 'Sustained'], 'Easy', 'Medium', 19.93],
  [4864, 'D', 23, 'BPM', 1300, ['Runs', 'Runs Without Twists', 'Sustained'], 'Medium', 'Hard', 24.29], [8431, 'S', 7, 'HP', 401, ['Anchor Runs', 'Runs'], null, 'Underrated', 11.65],
  [6270, 'S', 18, 'AHGOO', 1055, ['Anchor Runs', 'Runs', 'Runs Without Twists'], 'Medium', 'Hard', 21.53], [5137, 'S', 22, 'EXC', 1300, ['Drills', 'Runs', 'Sustained'], 'Hard', 'Hard', 23.55]];
const scores = { 7487: [992311, 'SSS', 'MG', 1], 5769: [961200, 'AAA+', 'TG', 0], 6270: [975500, 'S+', 'RG', 0], 8431: [998000, 'SSS+', 'PG', 0] };
const charts = rows.map(([id, mode, level, stepArtist, notes, skills, pd, sd, sl]) => {
  const s = scores[id];
  return { id, songId: 242, song, mode, level, stepArtist, notes, skills, passDifficulty: pd, scoreDifficulty: sd, scoringLevel: sl,
    score: s?.[0] ?? null, grade: s?.[1] ?? null, plate: s?.[2] ?? null, achievedAt: s ? '2026-11-20T20:00:00Z' : null,
    otherScore: id === 5769 ? 955000 : null, otherGrade: id === 5769 ? 'AAA' : null, otherPlate: null, broken: false,
    community: id === 5769 ? { avg: 0.6, votes: 4, tags: ['run', 'stamina'], club: null } : undefined,
    special: id === 4864 ? { g: ['speed', 'stop'], gimmick: true, off: false, note: null, admin: true } : undefined };
});
song.charts = charts;
const data = { version: 'phoenix2', songs: [song], charts, byId: new Map(charts.map((c) => [c.id, c])), plays: [], profile: null, lastSync: null, pumbilityHistory: [] };
const plan = { plan: 'plus', admin: new URLSearchParams(location.search).has('admin'), config: { toggles: {} } };
const ctx = { version: 'phoenix2', data, reload: () => {}, plan, reloadPlan: async () => plan, session: { user: { id: 'x' } }, notifications: { list: [] }, presence: {} };

createRoot(document.getElementById('root')).render(
  <DataCtx.Provider value={ctx}>
    <HashRouter><div className="app"><main className="content"><Routes><Route path="/musica/:id" element={<Song />} /><Route path="/tier" element={<Tier />} /><Route path="/matriz" element={<M />} /><Route path="/tentativas" element={<A />} /><Route path="/flags" element={<F />} /></Routes></main></div></HashRouter>
  </DataCtx.Provider>,
);

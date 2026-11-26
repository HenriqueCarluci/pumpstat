// Só para desenvolvimento: renderiza a página da música com dados de exemplo (não entra no build).
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { DataCtx } from './App.jsx';
import Song from './pages/Song.jsx';
import MyTeam from './pages/MyTeam.jsx';
import Tour from './components/Tour.jsx';
import { TrainingAddChip } from './components/TrainingToggle.jsx';
import { Ball as B2 } from './components/ui.jsx';
function P() { return <div className="page"><section className="card session">{charts.slice(0, 4).map((c, i) => <div key={c.id} className="plan-row"><a className="plan-item" href="#"><span className="kind">{['Aquecimento','Ponto fraco','Consolidar','Desafio'][i]}</span><B2 chart={c} size="sm" /><span className="ttl">{c.song.title} {c.mode}{c.level}</span></a><TrainingAddChip chart={c} /></div>)}</section></div>; }
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
import { ComparePlayer } from './pages/Players.jsx';

// respostas falsas do servidor para conferir telas que dependem de rpc
const FAKE = {
  chat_with: (() => { const now = Date.now(); const mk = (i, mine, kind, message, status) => ({ id: i, mine, kind, message, status, at: new Date(now - (20 - i) * 3600e3).toISOString() });
    return [mk(1, false, 'message', 'eai, bora treinar sábado na Liberdade?', 'accepted'), mk(2, true, 'message', 'bora! que horas você chega?', 'accepted'),
      mk(3, false, 'message', 'umas 15h. vou tentar passar o D20 de Gargoyle que tá me matando kkkkkk preciso de um tempo enorme pra isso', 'accepted'),
      mk(4, true, 'invite', 'Bora um x1?', 'accepted'), mk(5, false, 'message', 'fechou', 'accepted'), mk(6, true, 'message', 'https://www.youtube.com/watch?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'pending')]; })(),
  is_online: true, compare_player: [[4864, 900000, 'AA', 'FG', false, 950000, 'AAA', 'TG', false], [5769, 961200, 'AAA+', 'TG', false, 940000, 'AA+', 'FG', false]],
  players: [{ id: 'amigo', nickname: 'PUMPKING', avatar: null }], socials_of: { instagram: 'pumpking.br', twitch: 'pumpking', discord: 'pumpking' },
  my_training: [[5769, 1795700000]], training_set: [[5769, 1795700000], [4864, 1795710000]],
  countries_of: [['amigo', 'BR'], ['m2', 'BR'], ['m3', 'JP'], ['eu', 'BR']], teams_of: {},
  my_team: { team: { id: 1, name: "Team L'Aqua", tag: 'LAQUA', city: 'São Paulo - SP', logo: '/teams/laqua.jpg', instagram: 'team.laqua' },
    week: { plays: 132, passes: 97, active: 4 },
    members: [
      { id: 'amigo', me: false, friend: true, nickname: 'PUMPKING', title: 'Twist Master', pumbility: 16565.7, max_s: 22, max_d: 24, clears: 812, online: true, joined: '2026-10-01' },
      { id: 'eu', me: true, friend: false, nickname: 'HENRIQUE', title: 'Drill Expert', pumbility: 14104.2, max_s: 20, max_d: 21, clears: 540, online: true, joined: '2026-11-20' },
      { id: 'm2', me: false, friend: false, nickname: 'NEONSTEP', title: null, pumbility: 12950, max_s: 19, max_d: 22, clears: 301, online: false, joined: '2026-09-01' },
      { id: 'm3', me: false, friend: true, nickname: 'AKIRA_PIU_LONGNAME', title: 'Bracket Lv.10', pumbility: 9020.5, max_s: 18, max_d: null, clears: 120, online: false, joined: '2026-08-01' },
    ] },
};
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts) => {
  const m = String(url).match(/\/rpc\/([a-z_]+)/);
  if (m && m[1] in FAKE) return new Response(JSON.stringify(FAKE[m[1]]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (m) return new Response('null', { status: 200 });
  return realFetch(url, opts);
};


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
    <HashRouter><div className="app"><Tour /><main className="content"><Routes><Route path="/musica/:id" element={<Song />} /><Route path="/tier" element={<Tier />} /><Route path="/matriz" element={<M />} /><Route path="/tentativas" element={<A />} /><Route path="/flags" element={<F />} /><Route path="/time" element={<MyTeam />} /><Route path="/plano" element={<P />} /><Route path="/jogador/:id" element={<ComparePlayer />} /></Routes></main></div></HashRouter>
  </DataCtx.Provider>,
);

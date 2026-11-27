// Só para desenvolvimento: renderiza a página da música com dados de exemplo (não entra no build).
import { createRoot } from 'react-dom/client';
import AdminPage from './pages/Admin.jsx';
import { HashRouter, Route, Routes } from 'react-router-dom';
import TeamPicker from './components/TeamPicker.jsx';
import DayReport from './pages/DayReport.jsx';
import { DataCtx } from './App.jsx';
import Song from './pages/Song.jsx';
import MyTeam from './pages/MyTeam.jsx';
import Recommend from './pages/Recommend.jsx';
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
import HomeP from './pages/Home.jsx';
import SongsP from './pages/Songs.jsx';
import RecentP from './pages/Recent.jsx';
import SettingsP from './pages/Settings.jsx';
import VenuesP from './pages/Venues.jsx';
import QueueP from './pages/Queue.jsx';
import TitlesP from './pages/Titles.jsx';
import PlayersP from './pages/Players.jsx';
import VotesP from './pages/Votes.jsx';
import ProgressP from './pages/Progress.jsx';
import NotificationsP from './pages/Notifications.jsx';
import OnlineP from './pages/Online.jsx';
import PlansP from './pages/Plans.jsx';
import SubscriptionP from './pages/Subscription.jsx';
import TrainingP from './pages/Training.jsx';
import ChallengesP from './pages/Challenges.jsx';
import './styles.css';
import { ComparePlayer, PlayerProfile } from './pages/Players.jsx';
import ChartPage from './pages/Chart.jsx';

// respostas falsas do servidor para conferir telas que dependem de rpc
const FAKE = {
  chat_with: (() => { const now = Date.now(); const mk = (i, mine, kind, message, status) => ({ id: i, mine, kind, message, status, at: new Date(now - (20 - i) * 3600e3).toISOString() });
    return [mk(1, false, 'message', 'eai, bora treinar sábado na Liberdade?', 'accepted'), mk(2, true, 'message', 'bora! que horas você chega?', 'accepted'),
      mk(3, false, 'message', 'umas 15h. vou tentar passar o D20 de Gargoyle que tá me matando kkkkkk preciso de um tempo enorme pra isso', 'accepted'),
      mk(4, true, 'invite', 'Bora um x1?', 'accepted'), mk(5, false, 'message', 'fechou', 'accepted'), mk(6, true, 'message', 'https://www.youtube.com/watch?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'pending')]; })(),
  chart_stats: { players: 22, clears: 9, avg: 951200, grades: { 'SSS': 1, 'SS+': 2, 'S': 2, 'AAA+': 3, 'AA': 1 }, plays: 376, play_passes: 322 },
  chart_history: { bests: [[0, 940000], [0, 961200]], plays: [['2026-11-25T18:00:00Z', 961200, 'AAA+', 'TG', 1000, 160, 20, 4, 25, false]] },
  is_online: true, compare_player: [[4864, 900000, 'AA', 'FG', false, 950000, 'AAA', 'TG', false], [5769, 961200, 'AAA+', 'TG', false, 940000, 'AA+', 'FG', false], [7487, 992311, 'SSS', 'MG', false, 996000, 'SSS+', 'UG', false], [5137, null, null, null, null, 930000, 'AA+', null, true], [6270, 975500, 'S+', 'RG', false, 981000, 'SS', 'SG', false], [8431, 998000, 'SSS+', 'PG', false, 970500, 'S', 'MG', false]],
  players: [{ id: 'amigo', nickname: 'PUMPKING', avatar: null, title: 'Twist Master', pumbility: 16565.7, bests: 812 }], socials_of: { instagram: 'pumpking.br', twitch: 'pumpking', discord: 'pumpking' },
  team_report: (() => { const st = Math.floor(new Date('2026-11-23T03:00:00Z').getTime() / 1000);
    return { period: 'week', offset: 0, start: '2026-11-23T03:00:00Z', end: '2026-11-30T03:00:00Z',
      totals: { plays: 161, passes: 116, active: 5, songs: 107, avg_level: 19.7, max_d: 23, max_s: 24, new_clears: 22 },
      prev: { plays: 115, passes: 91, active: 3, new_clears: 18 },
      series: [0, 1, 2, 3, 4, 5, 6].map((i) => [st + i * 86400, [12, 20, 8, 30, 25, 14, 7][i], [4, 6, 2, 12, 9, 7, 5][i]]),
      top: [{ chart_id: 5769, song_id: 242, title: 'Gargoyle', mode: 'D', level: 20, plays: 9, passes: 6, players: 3 }, { chart_id: 4864, song_id: 242, title: 'Gargoyle', mode: 'D', level: 23, plays: 6, passes: 1, players: 2 }],
      members: [{ id: 'amigo', nickname: 'PUMPKING', plays: 70, passes: 58, new_clears: 9, max_d: 23, max_s: 24 }, { id: 'eu', nickname: 'HENRIQUE', plays: 51, passes: 33, new_clears: 8, max_d: 21, max_s: 20 }, { id: 'm3', nickname: 'AKIRA_PIU_LONGNAME', plays: 0, passes: 0, new_clears: 0, max_d: null, max_s: null }] }; })(),
  my_day_report: (() => { const s0 = 1795710000; return { day: '2026-11-25', start: s0, end: s0 + 86400, coverage: s0 - 86400 * 30,
    charts: [[4864, 4, 1, 912300, 'AA', 'RG', null, null, null, 6, 880100], [5137, 2, 1, 991200, 'SSS+', 'MG', 985000, 'SS+', 'TG', 3, null],
      [5769, 3, 3, 975500, 'S+', 'TG', 961200, 'AAA+', 'TG', 5, null], [6270, 3, 0, null, null, null, null, null, null, 4, 902000], [7487, 1, 1, 990100, 'SSS', 'MG', 992311, 'SSS', 'MG', 2, null]],
    plays: [[7487, s0 + 3600, 990100, 'SSS', 'MG', false, 1100, 60, 3, 0, 2], [5769, s0 + 3900, 961000, 'AAA+', 'TG', false, 980, 160, 20, 4, 25], [5769, s0 + 4200, 975500, 'S+', 'TG', false, 1050, 120, 10, 2, 7],
      [6270, s0 + 4500, 902000, 'AA', null, true, 800, 200, 30, 10, 15], [4864, s0 + 4800, 880100, 'A+', null, true, 900, 300, 40, 20, 40], [4864, s0 + 5100, 912300, 'AA', 'RG', false, 1000, 220, 30, 10, 40],
      [5137, s0 + 5400, 991200, 'SSS+', 'MG', false, 1250, 40, 5, 1, 4], [5769, s0 + 5700, 970000, 'S', 'TG', false, 1000, 150, 20, 4, 15], [6270, s0 + 6000, 850000, 'A', null, true, 700, 250, 50, 20, 35], [6270, s0 + 6300, 870000, 'A+', null, true, 750, 230, 40, 15, 20], [4864, s0 + 6600, 800000, 'A', null, true, 800, 300, 60, 30, 70], [4864, s0 + 6900, 0, null, null, true, 400, 100, 20, 10, 90], [5137, s0 + 7200, 985000, 'SS+', 'TG', true, 1200, 80, 10, 3, 10]],
    prev: { day: '2026-11-21', plays: 18, passes: 15, avg_level: 17.4, max_d: 21, max_s: 20 },
    days: [['2026-11-25', 13], ['2026-11-21', 18], ['2026-09-27', 31]] }; })(),
  list_teams: { teams: [], mine: null, pending: null },
  admin_stats: { users: 412, new_7d: 31, active_7d: 188, online: 12, linked: 300, plus: 40, pro: 6, feedback_open: 3, reports_open: 1, banned: 2 },
  admin_staff: [{ id: 'eu', role: 'owner', since: '2026-08-01T00:00:00Z', nickname: 'HENRIQUE', email: 'eu@exemplo.com' },
    { id: 'amigo', role: 'curator', since: '2026-11-20T00:00:00Z', nickname: 'PUMPKING', email: 'pk@exemplo.com' },
    { id: 'm2', role: 'moderator', since: '2026-11-21T00:00:00Z', nickname: 'NEONSTEP', email: 'neon@exemplo.com' }],
  admin_users: [{ id: 'amigo', email: 'pk@exemplo.com', provider: 'google', nickname: 'PUMPKING', plan: 'plus', plan_source: 'admin', plan_expires: '2027-01-01T00:00:00Z', admin: true, admin_role: 'curator', friends: 4, linked: true, created_at: '2026-08-01T00:00:00Z', last_sign_in: '2026-11-26T00:00:00Z' },
    { id: 'm2', email: 'neon@exemplo.com', provider: 'google', nickname: 'NEONSTEP', plan: 'free', admin: false, friends: 1, linked: true, created_at: '2026-09-01T00:00:00Z', last_sign_in: '2026-11-25T00:00:00Z' }],
  my_training: [[5769, 1795700000]], training_set: [[5769, 1795700000], [4864, 1795710000]],
  countries_of: [['amigo', 'BR'], ['m2', 'BR'], ['m3', 'JP'], ['eu', 'BR']], teams_of: { eu: { id: 1, name: "Team L'Aqua", tag: 'LAQUA', logo: '/teams/laqua.jpg' }, amigo: { id: 1, name: "Team L'Aqua", tag: 'LAQUA', logo: '/teams/laqua.jpg' } },
  my_team: { team: { id: 1, name: "Team L'Aqua", tag: 'LAQUA', city: 'São Paulo - SP', logo: '/teams/laqua.jpg', instagram: 'team.laqua', socials: { tiktok: 'team.laqua', discord: 'abcXYZ' } },
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
charts.forEach((c, i) => { c.ref = [3, 1, 0, -1, 9, -3][i % 6]; c.tags = [['twist', 'spin'], ['half', 'crossover'], ['gimmick', 'drill'], [], ['run'], ['jack']][i % 6]; });
const data = { version: 'phoenix2', songs: [song], charts, byId: new Map(charts.map((c) => [c.id, c])), plays: [], profile: { nickname: 'HENRIQUE', avatar_url: null, title: 'Drill Expert' }, lastSync: null, pumbilityHistory: [] };
const ADMIN_PERMS = { owner: ['plans','roles','stats','users','ban','reports','feedback','charts','events','venues','ads','config'],
  admin: ['stats','users','ban','reports','feedback','charts','events','venues','ads','config'], moderator: ['stats','users','ban','reports'],
  curator: ['stats','charts'], events: ['stats','events','venues'], support: ['stats','users','feedback'] };
const adminRole = new URLSearchParams(location.search).get('admin');
const plan = { plan: 'plus', admin: adminRole != null, admin_role: adminRole || null, perms: adminRole != null ? ADMIN_PERMS[adminRole || 'owner'] : [], config: { toggles: {} } };
const ctx = { version: 'phoenix2', data, reload: () => {}, plan, reloadPlan: async () => plan, session: { user: { id: 'eu' } }, notifications: { items: [], unread: 0, markSeen: () => {}, markAll: () => {} }, presence: {} };

createRoot(document.getElementById('root')).render(
  <DataCtx.Provider value={ctx}>
    <HashRouter><div className="app"><Tour /><main className="content"><Routes><Route path="/" element={<HomeP />} /><Route path="/musicas" element={<SongsP />} /><Route path="/recentes" element={<RecentP />} /><Route path="/ajustes" element={<SettingsP />} /><Route path="/fila" element={<VenuesP />} /><Route path="/fila/:slug" element={<QueueP />} /><Route path="/titulos" element={<TitlesP />} /><Route path="/jogadores" element={<PlayersP />} /><Route path="/votacoes" element={<VotesP />} /><Route path="/progresso" element={<ProgressP />} /><Route path="/notificacoes" element={<NotificationsP />} /><Route path="/online" element={<OnlineP />} /><Route path="/planos" element={<PlansP />} /><Route path="/assinatura" element={<SubscriptionP />} /><Route path="/treino" element={<TrainingP />} /><Route path="/desafios" element={<ChallengesP />} /><Route path="/musica/:id" element={<Song />} /><Route path="/tier" element={<Tier />} /><Route path="/matriz" element={<M />} /><Route path="/tentativas" element={<A />} /><Route path="/flags" element={<F />} /><Route path="/time" element={<MyTeam />} /><Route path="/pedido" element={<TeamPicker userId="eu" />} /><Route path="/dia" element={<DayReport />} /><Route path="/dia/:day" element={<DayReport />} /><Route path="/plano" element={<P />} /><Route path="/recomendacoes" element={<Recommend />} /><Route path="/chart/:id" element={<ChartPage />} /><Route path="/admin" element={<AdminPage />} /><Route path="/jogador/:id" element={<PlayerProfile />} /><Route path="/jogador/:id/vs" element={<ComparePlayer />} /></Routes></main></div></HashRouter>
  </DataCtx.Provider>,
);

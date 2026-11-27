// Só para desenvolvimento: renderiza a página da música com dados de exemplo (não entra no build).
import { createRoot } from 'react-dom/client';
import AdminPage from './pages/Admin.jsx';
import { HashRouter, Route, Routes } from 'react-router-dom';
import TeamPicker from './components/TeamPicker.jsx';
import DayReport from './pages/DayReport.jsx';
import NotifToast from './components/NotifToast.jsx';
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
import { SearchDialog, Sidebar, useSearchHotkey } from './components/DesktopNav.jsx';
import { useIsDesktop } from './lib/desktop.js';
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
import ProgressP, { ShareDonuts } from './pages/Progress.jsx';
import NotificationsP from './pages/Notifications.jsx';
import OnlineP from './pages/Online.jsx';
import PlansP from './pages/Plans.jsx';
import SubscriptionP from './pages/Subscription.jsx';
import TrainingP from './pages/Training.jsx';
import ChallengesP from './pages/Challenges.jsx';
import './styles.css';
import { ComparePlayer, PlayerProfile, PlayStyle } from './pages/Players.jsx';
import ChartPage from './pages/Chart.jsx';
import ReleaseNotesP from './pages/ReleaseNotes.jsx';
import { PreviewBanner, ViewAsBanner } from './components/PlanLock.jsx';
import { QuizPrompt } from './components/QuizModal.jsx';
import { asPreviewUser } from './lib/plans.js';

// respostas falsas do servidor para conferir telas que dependem de rpc
const FAKE = {
  release_notes: [
    { id: 9, status: 'released', released_on: '2026-11-27', tag: 'new', title: { pt: 'Missões da semana personalizadas', en: 'Personalized weekly missions' }, body: { pt: 'Metas montadas pelo seu histórico, com charts nomeados, foco da semana, troca de missão, pontos e selos. Só na Phoenix 2.' } },
    { id: 8, status: 'released', released_on: '2026-11-27', tag: 'new', title: { pt: 'PIU Stats no computador' }, body: { pt: 'Em piustats.com.br o site tem cara de site: menu lateral, busca com Ctrl+K e páginas em colunas.' } },
    { id: 7, status: 'released', released_on: '2026-11-27', tag: 'improved', title: { pt: 'Atalhos do início e redes no perfil' }, body: { pt: 'Os 4 atalhos que você mais usa ficam numa linha.' } },
    { id: 6, status: 'released', released_on: '2026-11-26', tag: 'fixed', title: { pt: 'Login não esquece a sessão' }, body: {} },
    { id: 20, status: 'soon', released_on: null, eta: '2026-12-01', eta_precision: 'month', tag: 'new', title: { pt: 'Planos Plus e Pro' }, body: { pt: 'Análises, treino e recursos sociais a mais, com preço de lançamento nos primeiros meses.' } },
    { id: 21, status: 'soon', released_on: null, tag: 'new', title: { pt: 'Sincronização automática' }, body: { pt: 'Suas notas atualizadas sozinhas depois de jogar.' } }],
  admin_set_preview: null,
  admin_perm_matrix: [{ id: 'eu', role: 'owner', email: 'h@x.com', nickname: 'HENRIQUE', perms: [], defaults: [], overrides: {} }, { id: 'amigo', role: 'curator', email: 'pk@exemplo.com', nickname: 'PUMPKING', perms: ['charts', 'events'], defaults: ['charts'], overrides: { events: true } }, { id: 'm2', role: 'support', email: 'neon@exemplo.com', nickname: 'NEONSTEP', perms: ['feedback'], defaults: ['users', 'feedback'], overrides: { users: false } }],
  admin_set_perm_override: null,
  admin_new_users: { day: 2, week: 9, notify: true, list: [{ id: 'n1', email: 'novo@exemplo.com', provider: 'google', created_at: new Date(Date.now() - 40 * 60e3).toISOString(), nickname: null }, { id: 'n2', email: 'x@exemplo.com', provider: 'email', created_at: new Date(Date.now() - 5 * 3600e3).toISOString(), nickname: 'NEONSTEP' }] },
  admin_feature_grants: [{ feature: 'player_stats', expires_at: '2027-02-25T00:00:00Z', note: 'membro do clube', active: true }],
  get admin_release_notes() { return FAKE.release_notes.map((n) => ({ ...n, published: true })).concat([{ id: 30, status: 'soon', tag: 'new', title: { pt: 'Competições no perfil (CBPIU e LBPIU)' }, body: {}, published: false, sort: 5 }]); },
  chat_with: (() => { const now = Date.now(); const mk = (i, mine, kind, message, status) => ({ id: i, mine, kind, message, status, at: new Date(now - (20 - i) * 3600e3).toISOString(), reactions: i === 3 ? [{ e: '😂', mine: true }, { e: '😂', mine: false }] : i === 2 ? [{ e: '🔥', mine: false }] : [] });
    return [mk(1, false, 'message', 'eai, bora treinar sábado na Liberdade?', 'accepted'), mk(2, true, 'message', 'bora! que horas você chega?', 'accepted'),
      mk(3, false, 'message', 'umas 15h. vou tentar passar o D20 de Gargoyle que tá me matando kkkkkk preciso de um tempo enorme pra isso', 'accepted'),
      mk(4, true, 'invite', 'Bora um x1?', 'accepted'), mk(5, false, 'message', 'fechou', 'accepted'), mk(6, true, 'message', 'https://www.youtube.com/watch?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'pending')]; })(),
  chart_stats: { players: 22, clears: 9, avg: 951200, grades: { 'SSS': 1, 'SS+': 2, 'S': 2, 'AAA+': 3, 'AA': 1 }, plays: 376, play_passes: 322 },
  chart_history: { bests: [[0, 940000], [0, 961200]], plays: [['2026-11-25T18:00:00Z', 961200, 'AAA+', 'TG', 1000, 160, 20, 4, 25, false]] },
  is_online: true, compare_player: [[4864, 900000, 'AA', 'FG', false, 950000, 'AAA', 'TG', false], [5769, 961200, 'AAA+', 'TG', false, 940000, 'AA+', 'FG', false], [7487, 992311, 'SSS', 'MG', false, 996000, 'SSS+', 'UG', false], [5137, null, null, null, null, 930000, 'AA+', null, true], [6270, 975500, 'S+', 'RG', false, 981000, 'SS', 'SG', false], [8431, 998000, 'SSS+', 'PG', false, 970500, 'S', 'MG', false]],
  search_players: [{ id: 'amigo', nickname: 'PUMPKING', title: 'Twist Master', avatar: null, relation: 'friend' }],
  admin_health: { at: new Date().toISOString(), db: { size: 38770355, max_connections: 60, connections: { active: 1, idle: 9 }, cache_hit: 100, index_hit: 99.98, tables: [{ name: 'chart_tags_ref', rows: 30906, bytes: 6791168, dead: 0 }, { name: 'charts', rows: 9511, bytes: 6103040, dead: 0 }, { name: 'user_titles', rows: 4277, bytes: 1277952, dead: 469 }], statements: [{ q: 'SELECT wal->>$5 as type', calls: 30798, mean_ms: 5.6, total_s: 171.7 }, { q: 'app_data', calls: 721, mean_ms: 188, total_s: 135.6 }, { q: 'my_progress', calls: 477, mean_ms: 176.9, total_s: 84.4 }, { q: 'my_notifications', calls: 1736, mean_ms: 32.9, total_s: 57.1 }] }, usage: { users: 10, new_7d: 10, online_now: 1, active_24h: 9, active_7d: 9, syncs_24h: 50, plays_24h: 12, queue_now: 0, last_sync: new Date(Date.now() - 2 * 3600e3).toISOString(), sources_7d: { server: 72 }, unmatched_7d: 0, syncs_by_hour: Array.from({ length: 14 }, (_, i) => [new Date(Date.now() - i * 3600e3).toISOString(), (i * 7) % 6 + 1]) }, jobs: [{ name: 'stepclub-queue-housekeeping', schedule: '*/5 * * * *', active: true, fails_24h: 0, last: { status: 'succeeded', start: new Date().toISOString(), ms: 31 } }], arcadestat: { at: new Date(Date.now() - 7 * 3600e3).toISOString(), rows: 5482, matched: 5482, unmatched: 0 }, errors: { count_24h: 3, users_24h: 2, top: [{ message: "Cannot read properties of undefined (reading 'map')", n: 3, users: 2, platform: 'android', last: new Date().toISOString(), route: '#/progresso', build: '2026-11-27 10:40', stack: 'TypeError: Cannot read properties of undefined\n    at Progress (Progress.jsx:120)' }] } },
  players: [{ id: 'amigo', nickname: 'PUMPKING', avatar: null, title: 'Twist Master', pumbility: 16565.7, bests: 812, private: location.search.includes('private') }],
  my_privacy: { private_stats: false },
  my_quiz: location.search.includes('quiz=new') ? { quiz: null } : { quiz: { exp: 'y1_3', freq: 'few', goal: 'level', mode: 'D', skills: ['twist', 'drill'] }, at: '2026-11-27T10:00:00Z' },
  save_quiz: null, skip_quiz: null, socials_of: { instagram: 'pumpking.br', twitch: 'pumpking', discord: 'pumpking' },
  team_report: (() => { const st = Math.floor(new Date('2026-11-23T03:00:00Z').getTime() / 1000);
    return { period: 'week', offset: 0, start: '2026-11-23T03:00:00Z', end: '2026-11-30T03:00:00Z',
      totals: { plays: 161, passes: 116, active: 5, songs: 107, avg_level: 19.7, max_d: 23, max_s: 24, new_clears: 22 },
      prev: { plays: 115, passes: 91, active: 3, new_clears: 18 },
      series: [0, 1, 2, 3, 4, 5, 6].map((i) => [st + i * 86400, [12, 20, 8, 30, 25, 14, 7][i], [4, 6, 2, 12, 9, 7, 5][i]]),
      top: [{ chart_id: 5769, song_id: 242, title: 'Gargoyle', mode: 'D', level: 20, plays: 9, passes: 6, players: 3 }, { chart_id: 4864, song_id: 242, title: 'Gargoyle', mode: 'D', level: 23, plays: 6, passes: 1, players: 2 }],
      members: [{ id: 'amigo', nickname: 'PUMPKING', plays: 70, passes: 58, new_clears: 9, max_d: 23, max_s: 24 }, { id: 'eu', nickname: 'HENRIQUE', plays: 51, passes: 33, new_clears: 8, max_d: 21, max_s: 20 }, { id: 'm3', nickname: 'AKIRA_PIU_LONGNAME', plays: 0, passes: 0, new_clears: 0, max_d: null, max_s: null }] }; })(),
  my_day_report: (() => { const s0 = 1795710000; return { day: '2026-11-25', start: s0, end: s0 + 86400, coverage: s0 - 86400 * 30,
    charts: [[4864, 4, 1, 912300, 'AA', 'RG', null, null, null, 6, 880100], [5137, 2, 1, 991200, 'SSS+', 'MG', 985000, 'SS+', 'TG', 3, null],
      [5769, 3, 3, 975500, 'S+', 'TG', 961200, 'AAA+', 'TG', 5, null], [6270, 4, 1, null, null, null, null, null, null, 4, 902000], [7487, 1, 1, 990100, 'SSS', 'MG', 992311, 'SSS', 'MG', 2, null]],
    plays: [[7487, s0 + 3600, 990100, 'SSS', 'MG', false, 1100, 60, 3, 0, 2], [5769, s0 + 3900, 961000, 'AAA+', 'TG', false, 980, 160, 20, 4, 25], [5769, s0 + 4200, 975500, 'S+', 'TG', false, 1050, 120, 10, 2, 7],
      [6270, s0 + 4500, 902000, 'AA', null, true, 800, 200, 30, 10, 15], [4864, s0 + 4800, 880100, 'A+', null, true, 900, 300, 40, 20, 40], [4864, s0 + 5100, 912300, 'AA', 'RG', false, 1000, 220, 30, 10, 40],
      [5137, s0 + 5400, 991200, 'SSS+', 'MG', false, 1250, 40, 5, 1, 4], [5769, s0 + 5700, 970000, 'S', 'TG', false, 1000, 150, 20, 4, 15], [6270, s0 + 6000, 850000, 'A', null, true, 700, 250, 50, 20, 35], [6270, s0 + 6300, 870000, 'A+', null, true, 750, 230, 40, 15, 20], [4864, s0 + 6600, 800000, 'A', null, true, 800, 300, 60, 30, 70], [4864, s0 + 6900, 0, null, null, true, 400, 100, 20, 10, 90], [6270, s0 + 7000, null, null, null, false, 0, 0, 0, 0, 777], [5137, s0 + 7200, 985000, 'SS+', 'TG', true, 1200, 80, 10, 3, 10]],
    prev: { day: '2026-11-21', plays: 18, passes: 15, avg_level: 17.4, max_d: 21, max_s: 20 },
    days: [['2026-11-25', 13], ['2026-11-21', 18], ['2026-09-27', 31]] }; })(),
  list_teams: { teams: [], mine: { id: 1, name: "Team L'Aqua", tag: 'LAQUA', logo: '/teams/laqua.jpg', instagram: 'team.laqua' }, pending: null },
  online_players: [
    { id: 'amigo', nickname: 'OINOMORI #7461', title: '[D] ADVANCED LV.7', pumbility: 17046, max: { S: 21, D: 24, version: 'phoenix2' }, match: 'close', venue: 'HotZone ParkShopping São Caetano', friend: true, status: 'online' },
    { id: 'm2', nickname: 'FROZEN07 #1125', title: '[THE 1ST] BOSS BREAKER', pumbility: 3811, max: { S: 13, D: 8, version: 'phoenix2' }, status: 'online' },
    { id: 'm3', nickname: 'AKIRA_PIU_LONGNAME #0001', title: 'Bracket Lv.10', pumbility: 9020, max: { S: 18, D: 19, version: 'phoenix' }, same_venue: true, status: 'away', invited: true },
  ],
  lives_now: [{ user: 'amigo', login: 'oinomori', title: 'Treino D24 no Phoenix 2', started_at: new Date().toISOString() }],
  app_config: { community: { tier_vote_hours: 48, tier_vote_min: 3 } },
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
// missões da semana (fakes com estado: init, troca e foco)
{
  const mon = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const prev = new Date(mon); prev.setDate(prev.getDate() - 7);
  const ws = Math.floor(mon.getTime() / 1000);
  const ids = [7487, 5769, 4864, 8431, 6270, 5137];
  const plays = [];
  for (let w = 6; w >= 0; w--) for (let i = 0; i < (w === 0 ? 5 : 9); i++) {
    const id = ids[(i + w) % ids.length]; const at = ws - w * 7 * 86400 + (i % 3) * 86400 + 3600 * (i + 1);
    const broken = id === 4864 || (id === 5137 && w > 0);
    plays.push([id, at, broken ? 700000 : 940000 + i * 1500 + (6 - w) * 900, broken ? 'B' : 'AAA', broken, 900, 120, 10, 3, broken ? 40 : 4]);
  }
  const history = plays.filter((p) => !p[4]).map((p) => [p[0], p[1], p[2], p[3], 'TG', false]).concat([[4864, ws - 20 * 86400, 700000, 'B', null, true]]);
  FAKE.my_progress = { plays, history, firsts: [], styles: [] };
  FAKE.my_week = { week: key(mon), prev: key(prev), weeks: [key(mon), key(prev)], pb: { start: 14000, end: 14104 }, rival: { id: 'amigo', nickname: 'PUMPKING', start: 16400, end: 16565, plays: 40 } };
  let row = null;
  FAKE.missions_ctx = () => ({ row, past: [{ week: key(prev), done: 4, total: 4, completed_at: new Date(prev.getTime() + 2 * 86400000).toISOString(), types: ['days', 'improve', 'clear_prev', 'near_clear'] }],
    rival: { id: 'amigo', nickname: 'PUMPKING', cleared: [4864, 5137, 6270] }, friends: [[6270, 'PUMPKING'], [7487, 'NEONSTEP']], checkins: 0, visited: true, friend_count: 3, badges: [] });
  FAKE.set_week_missions = (b) => {
    if (b.p_action === 'init' && row) return row;
    row = { week: key(mon), mode: b.p_mode, focus: b.p_focus, missions: b.p_missions, total: b.p_missions.length, done: 0, progress: null,
      rerolls: (row?.rerolls || 0) + (b.p_action === 'reroll' ? 1 : 0), focus_changes: (row?.focus_changes || 0) + (b.p_action === 'focus' ? 1 : 0) };
    return row;
  };
  FAKE.report_week_progress = (b) => ({ completed: b.p_done >= (row?.total || 99), new: b.p_done >= 2 ? [['weeks', 1]] : [], points_total: 230 + b.p_done * 20 });
  FAKE.points_of = 230;
  FAKE.badges_of = [['weeks', 1, 1795700000], ['weeks', 5, 1795710000], ['streak', 4, 1795720000]];
  FAKE.admin_mission_stats = { weeks: [{ week: key(mon), users: 41, completed: 6, avg_pct: 48, rerolls: 12, focus_changes: 9, focus: { auto: 30, level: 6, score: 3, fun: 2 } },
    { week: key(prev), users: 52, completed: 19, avg_pct: 71, rerolls: 20, focus_changes: 14, focus: { auto: 38, level: 8, weak: 6 } }],
    types: [{ type: 'days', tier: 'easy', shown: 40, done: 36 }, { type: 'near_clear', tier: 'hard', shown: 20, done: 4 }, { type: 'grade_up', tier: 'medium', shown: 22, done: 11 }, { type: 'weak', tier: 'medium', shown: 18, done: 9 }],
    badges: { 'weeks:1': 30, 'weeks:5': 4, 'streak:4': 12 } };
}
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts) => {
  const m = String(url).match(/\/rpc\/([a-z_]+)/);
  if (m && m[1] in FAKE) {
    const v = typeof FAKE[m[1]] === 'function' ? FAKE[m[1]](JSON.parse(opts?.body || '{}')) : FAKE[m[1]];
    return new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
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
import { ROLE_PERMS as ADMIN_PERMS } from './lib/admin.js';
const adminRole = new URLSearchParams(location.search).get('admin');
const previewQ = new URLSearchParams(location.search).get('preview');
const trialQ = new URLSearchParams(location.search).get('trial');
const viewQ = new URLSearchParams(location.search).get('viewas');
const plan = { view_as: viewQ ? { admin: 'eu', target: 'amigo', email: 'pk@exemplo.com', expires_at: new Date(Date.now() + 28 * 60e3).toISOString() } : null, plan: 'plus', source: trialQ ? 'trial' : 'admin', expires_at: trialQ ? new Date(Date.now() + Number(trialQ) * 86400e3 - 3600e3).toISOString() : '2027-01-01T00:00:00Z', preview: previewQ ? { plan: previewQ, expires_at: new Date(Date.now() + 47 * 60e3).toISOString() } : null, admin: adminRole != null, admin_role: adminRole || null, perms: adminRole != null ? ADMIN_PERMS[adminRole || 'owner'] : [], config: { toggles: {}, trial_plan: 'plus', trial_days: 15, prices: { BR: { currency: 'BRL', plus: 6.9, pro: 12.9, plus_year: 59.9, pro_year: 109.9 }, WORLD: { currency: 'USD', plus: 2.49, pro: 4.99, plus_year: 19.99, pro_year: 39.99 } }, intro: { months: 2, prices: { BR: { plus: 5.9, pro: 9.9 }, WORLD: { plus: 1.99, pro: 3.99 } } } } };
const NOTIF_ITEMS = new URLSearchParams(location.search).get('notif') ? (() => { const at = (m) => new Date(Date.now() - m * 60000).toISOString(); return [
  { kind: 'friend_live', key: 'n:1', at: at(1), unread: true, user: 'amigo', nickname: 'PUMPKING', login: 'pumpking', title: 'Treinando D24 no Phoenix 2', live_now: true },
  { kind: 'friend_pumbility', key: 'fp:1', at: at(2), unread: true, user: 'amigo', nickname: 'PUMPKING', pumbility: 16580.4, prev: 16565.7, version: 'phoenix2' },
  { kind: 'friend_score', key: 'fs:1', at: at(3), unread: true, user: 'm2', nickname: 'NEONSTEP', song: 1, title: 'Gargoyle', mode: 'D', level: 23, grade: 'AA+', score: 931200, prev_score: null },
  { kind: 'friend_score', key: 'fs:2', at: at(4), unread: true, user: 'm2', nickname: 'NEONSTEP', song: 2, title: 'Mephitz', mode: 'S', level: 20, grade: 'S', score: 975000, prev_score: 961000 },
  { kind: 'new_song', key: 'ns:1', at: at(5), unread: true, song: 3, title: 'Nova Música', charts: ['S18', 'D22'] },
]; })() : [];
const ctx = { version: new URLSearchParams(location.search).get('ver') || 'phoenix2', setVersion: (v) => { location.search = v === 'phoenix2' ? '' : `?ver=${v}`; }, data, reload: () => {}, plan: asPreviewUser(plan), reloadPlan: async () => plan, session: { user: { id: 'eu' } }, notifications: { items: NOTIF_ITEMS, loaded: true, unread: NOTIF_ITEMS.length, markSeen: () => {}, markAll: () => {}, dismiss: () => {}, clearAll: () => {} }, presence: {} };

function HShell({ children }) {
  const desk = useIsDesktop();
  const [q, setQ] = useState(false);
  const open = () => setQ(true);
  useSearchHotkey(desk ? open : () => {});
  return <div className="app shell"><div className="shell-scroll">{desk && <Sidebar onSearch={open} />}{q && <SearchDialog onClose={() => setQ(false)} />}
    <header className="topbar">{desk && <button type="button" className="top-search" onClick={open}><span>Buscar música, artista, jogador ou página…</span><kbd>Ctrl K</kbd></button>}<span className="brand">PIU Stats</span></header>
    <ViewAsBanner /><PreviewBanner /><QuizPrompt /><Tour /><NotifToast />{children}</div><nav className="tabbar"><a>Início</a><a>Músicas</a><a>Tier</a><a>Fila</a><a>Ajustes</a></nav></div>;
}

createRoot(document.getElementById('root')).render(
  <DataCtx.Provider value={ctx}>
    <HashRouter><HShell><main className="content"><Routes><Route path="/" element={<HomeP />} /><Route path="/musicas" element={<SongsP />} /><Route path="/recentes" element={<RecentP />} /><Route path="/ajustes" element={<SettingsP />} /><Route path="/fila" element={<VenuesP />} /><Route path="/fila/:slug" element={<QueueP />} /><Route path="/titulos" element={<TitlesP />} /><Route path="/jogadores" element={<PlayersP />} /><Route path="/votacoes" element={<VotesP />} /><Route path="/progresso" element={<ProgressP />} /><Route path="/notificacoes" element={<NotificationsP />} /><Route path="/online" element={<OnlineP />} /><Route path="/planos" element={<PlansP />} /><Route path="/assinatura" element={<SubscriptionP />} /><Route path="/treino" element={<TrainingP />} /><Route path="/desafios" element={<ChallengesP />} /><Route path="/musica/:id" element={<Song />} /><Route path="/tier" element={<Tier />} /><Route path="/matriz" element={<M />} /><Route path="/tentativas" element={<A />} /><Route path="/flags" element={<F />} /><Route path="/time" element={<MyTeam />} /><Route path="/pedido" element={<TeamPicker userId="eu" />} /><Route path="/dia" element={<DayReport />} /><Route path="/dia/:day" element={<DayReport />} /><Route path="/plano" element={<P />} /><Route path="/recomendacoes" element={<Recommend />} /><Route path="/chart/:id" element={<ChartPage />} /><Route path="/admin" element={<AdminPage />} /><Route path="/novidades" element={<ReleaseNotesP />} /><Route path="/teststyle" element={<TestStyle />} /><Route path="/testdonut" element={<TestDonut />} /><Route path="/jogador/:id" element={<PlayerProfile />} /><Route path="/jogador/:id/vs" element={<ComparePlayer />} /></Routes></main></HShell></HashRouter>
  </DataCtx.Provider>,
);

function TestDonut() {
  const cs = Array.from({ length: 12 }, (_, i) => ({ id: 7000 + i, mode: 'D', level: 23 - (i % 4), song: { id: 7000 + i, title: `Song ${i + 1}`, jacket: null } }));
  const r = (c, passes, fails, other) => ({ chart: c, passes, fails, attempts: passes + fails, other });
  const share = { pass: { twist: 57, run: 44, speed: 43, drill: 40, stamina: 32, bracket: 26, jump: 4 }, fail: { twist: 20, drill: 12, jack: 2 },
    lists: { pass: { twist: [r(cs[0], 3, 1), r(cs[1], 1, 0), r(cs[2], 2, 2, true)], run: [r(cs[3], 1, 0)], speed: [r(cs[4], 2, 0)], drill: [r(cs[5], 1, 3)], stamina: [r(cs[6], 1, 0)], bracket: [r(cs[7], 1, 0)], jump: [r(cs[8], 1, 0)] },
      fail: { twist: [r(cs[0], 3, 1), r(cs[2], 2, 2, true)], drill: [r(cs[5], 1, 3)], jack: [r(cs[9], 0, 2)] } } };
  return <ShareDonuts share={share} otherName="Phoenix" />;
}
function TestStyle() {
  const mk = (i, lv, broken, tags) => ({ id: i, mode: 'D', level: lv, score: 950000 - i * 1000, grade: 'AA', plate: null, broken, tagBars: tags, song: { id: i, title: `Song ${i}`, jacket: null } });
  const charts = [];
  for (let i = 0; i < 8; i++) charts.push(mk(i + 1, 22 - (i % 3), false, [['twist', 80], ['run', 60]]));
  for (let i = 0; i < 4; i++) charts.push(mk(i + 20, 22, true, [['jump', 70], ['twist', 55]]));
  return <div className="page"><PlayStyle charts={charts} stats={[{ mode: 'D', max: 22 }, { mode: 'S', max: 0 }]} name="X" me /></div>;
}

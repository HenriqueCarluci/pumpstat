// Desktop: barra lateral com todas as seções e busca global (Ctrl+K ou /) por música, jogador e página.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { isOn } from '../lib/plans.js';
import { t } from '../lib/i18n.js';
import { Ball, Jacket } from './ui.jsx';
import { LockBadge } from './PlanLock.jsx';
import {
  Bell, CalendarCheck, Dumbbell, History, HomeIcon, LayoutGrid, ListOrdered, Logo, Music2, SettingsIcon, Shield,
  ShieldCheck, Tag, Target, TrendingUp, Trophy, Users, Vote,
} from './Icons.jsx';

/** Seções do app (a mesma lista alimenta a barra lateral e a busca de páginas). */
export function useSections() {
  const { plan, presence, notifications } = useData();
  return useMemo(() => [
    { g: null, items: [
      { to: '/', label: 'Início', icon: <HomeIcon size={18} />, end: true },
      { to: '/musicas', label: 'Músicas', icon: <Music2 size={18} /> },
      { to: '/tier', label: 'Tier', icon: <LayoutGrid size={18} /> },
      { to: '/fila', label: 'Fila', icon: <ListOrdered size={18} /> },
    ] },
    { g: 'Evolução', items: [
      { to: '/progresso', label: 'Progresso', icon: <TrendingUp size={18} /> },
      isOn(plan, 'training') && { to: '/treino', label: 'Meu treino', icon: <Dumbbell size={18} />, f: 'training_list' },
      { to: '/recomendacoes', label: 'Recomendadas', icon: <Target size={18} />, f: 'recommendations_all' },
      isOn(plan, 'challenges') && { to: '/desafios', label: 'Desafios', icon: <Trophy size={18} /> },
    ].filter(Boolean) },
    { g: 'Seu jogo', items: [
      isOn(plan, 'day_report') && { to: '/dia', label: 'Dia de jogo', icon: <CalendarCheck size={18} />, f: 'day_report' },
      { to: '/recentes', label: 'Recentes', icon: <History size={18} /> },
      { to: '/titulos', label: 'Títulos', icon: <Tag size={18} /> },
    ].filter(Boolean) },
    { g: 'Social', items: [
      isOn(plan, 'online') && { to: '/online', label: 'Online', icon: <span className="dot-on" />, n: presence?.online || 0 },
      { to: '/jogadores', label: 'Amigos', icon: <Users size={18} /> },
      isOn(plan, 'teams') && { to: '/time', label: 'Meu Time', icon: <Shield size={18} /> },
      isOn(plan, 'tier_votes') && { to: '/votacoes', label: 'Votações', icon: <Vote size={18} /> },
      { to: '/notificacoes', label: 'Notificações', icon: <Bell size={18} />, n: notifications?.unread || 0 },
    ].filter(Boolean) },
  ], [plan, presence?.online, notifications?.unread]);
}

export function Sidebar({ onSearch }) {
  const { plan } = useData();
  const sections = useSections();
  return (
    <aside className="sidebar" aria-label={t('Navegação')}>
      <NavLink to="/" end className="sb-brand"><Logo /> <span>PIU Stats</span></NavLink>
      <button type="button" className="sb-search" onClick={onSearch}>
        <span>{t('Buscar…')}</span><kbd>Ctrl K</kbd>
      </button>
      <nav className="sb-nav">
        {sections.map((s, i) => (
          <div key={i} className="sb-group">
            {s.g && <div className="sb-g">{t(s.g)}</div>}
            {s.items.map((x) => (
              <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`}>
                <span className="sb-ico">{x.icon}</span><span className="sb-l">{t(x.label)}</span>
                {x.n > 0 && <i className="sb-n">{x.n > 99 ? '99+' : x.n}</i>}
                {x.f && <LockBadge feature={x.f} />}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        {plan?.admin && <NavLink to="/admin" className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`}><span className="sb-ico"><ShieldCheck size={18} /></span><span className="sb-l">{t('Administração')}</span></NavLink>}
        <NavLink to="/ajustes" className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`}><span className="sb-ico"><SettingsIcon size={18} /></span><span className="sb-l">{t('Ajustes')}</span></NavLink>
      </div>
    </aside>
  );
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca global: páginas, músicas (com os níveis) e jogadores. Setas + Enter para navegar. */
export function SearchDialog({ onClose }) {
  const { data } = useData();
  const sections = useSections();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState([]);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setPlayers([]); return undefined; }
    const h = setTimeout(() => rpc('search_players', { p_query: term }).then((r) => setPlayers((r || []).slice(0, 5))).catch(() => setPlayers([])), 250);
    return () => clearTimeout(h);
  }, [q]);

  const results = useMemo(() => {
    const n = norm(q.trim());
    const pages = sections.flatMap((s) => s.items).concat([{ to: '/ajustes', label: 'Ajustes' }])
      .filter((x) => !n || norm(t(x.label)).includes(n)).slice(0, n ? 4 : 6)
      .map((x) => ({ kind: 'page', key: `p${x.to}`, to: x.to, label: t(x.label), icon: x.icon }));
    const songs = n.length >= 2 ? data.songs.filter((s) => norm(s.title).includes(n) || norm(s.artist).includes(n))
      .sort((a, b) => (norm(a.title).startsWith(n) ? 0 : 1) - (norm(b.title).startsWith(n) ? 0 : 1)).slice(0, 8)
      .map((s) => ({ kind: 'song', key: `s${s.id}`, to: `/musica/${s.id}`, song: s })) : [];
    const ps = players.map((p) => ({ kind: 'player', key: `u${p.id}`, to: `/jogador/${p.id}`, player: p }));
    return [...songs, ...ps, ...pages];
  }, [q, data, sections, players]);
  useEffect(() => { setSel(0); }, [q]);

  const go = (r) => { if (!r) return; onClose(); nav(r.to); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]); }
    else if (e.key === 'Escape') onClose();
  };
  let lastKind = null;
  const head = { song: 'Músicas', player: 'Jogadores', page: 'Páginas' };
  return (
    <div className="search-wrap" onClick={onClose}>
      <div className="search-dlg" role="dialog" aria-modal="true" aria-label={t('Buscar')} onClick={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t('Buscar música, artista, jogador ou página…')}
          aria-label={t('Buscar')} autoComplete="off" spellCheck={false} />
        <div className="search-res" role="listbox">
          {results.map((r, i) => {
            const h = r.kind !== lastKind ? <div className="sr-h" key={`h${r.kind}`}>{t(head[r.kind])}</div> : null;
            lastKind = r.kind;
            return [h, (
              <button key={r.key} type="button" role="option" aria-selected={i === sel} className={`sr ${i === sel ? 'on' : ''}`}
                onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
                {r.kind === 'song' && <><Jacket song={r.song} width={40} /><span className="sr-t"><b>{r.song.title}</b><small>{r.song.artist}</small></span>
                  <span className="sr-lv">{r.song.charts.filter((c) => c.mode === 'S' || c.mode === 'D').slice(-4).map((c) => <Ball key={c.id} chart={c} size="sm" />)}</span></>}
                {r.kind === 'player' && <><span className="sr-av">{r.player.avatar ? <img src={r.player.avatar} alt="" referrerPolicy="no-referrer" /> : (r.player.nickname || '?')[0]}</span>
                  <span className="sr-t"><b>{r.player.nickname}</b><small>{r.player.title || ''}</small></span></>}
                {r.kind === 'page' && <><span className="sr-ico">{r.icon}</span><span className="sr-t"><b>{r.label}</b></span></>}
              </button>
            )];
          })}
          {!results.length && <p className="muted small sr-empty">{t('Nada encontrado.')}</p>}
        </div>
        <div className="search-foot muted tiny"><kbd>↑</kbd><kbd>↓</kbd> {t('navegar')} · <kbd>Enter</kbd> {t('abrir')} · <kbd>Esc</kbd> {t('fechar')}</div>
      </div>
    </div>
  );
}

/** Atalhos de teclado do desktop: Ctrl/⌘+K ou "/" abrem a busca. */
export function useSearchHotkey(open) {
  useEffect(() => {
    const k = (e) => {
      const typing = /input|textarea|select/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); open(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
}

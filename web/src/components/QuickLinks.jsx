// Atalhos da Início: uma linha com os 4 mais usados (ou os que a pessoa fixou) e "Mais", que abre uma gaveta
// com todos, agrupados. Em mobile, uma linha compacta + gaveta de baixo é melhor que grade grande ou menu suspenso:
// o que a pessoa mais usa fica a um toque, o resto continua visível com um toque a mais e fica ao alcance do polegar.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../App.jsx';
import { isOn } from '../lib/plans.js';
import { LockBadge } from './PlanLock.jsx';
import { t } from '../lib/i18n.js';
import {
  CalendarCheck, Dumbbell, History, LayoutGrid, Shield, Star, Tag, Target, TrendingUp, Trophy, Users, X,
} from './Icons.jsx';

const USE_KEY = 'pumpstat:ql-usage';
const PIN_KEY = 'pumpstat:ql-pins';
const MAX_ROW = 4;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } };

const GROUPS = [['social', 'Social'], ['evo', 'Evolução'], ['game', 'Seu jogo']];
// ordem padrão (quem ainda não usou nada vê os 4 primeiros disponíveis)
const DEFAULT = ['online', 'training', 'progress', 'friends', 'day', 'recs', 'team', 'challenges', 'titles', 'recent'];

export default function QuickLinks() {
  const { plan, presence } = useData();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState(() => read(PIN_KEY, []));
  const [usage] = useState(() => read(USE_KEY, {}));

  const items = useMemo(() => [
    isOn(plan, 'online') && { id: 'online', g: 'social', to: '/online', label: 'Online', icon: <span className="dot-on" />, n: presence?.online || 0 },
    { id: 'friends', g: 'social', to: '/jogadores', label: 'Amigos', icon: <Users size={18} /> },
    isOn(plan, 'teams') && { id: 'team', g: 'social', to: '/time', label: 'Meu Time', icon: <Shield size={18} /> },
    isOn(plan, 'training') && { id: 'training', g: 'evo', to: '/treino', label: 'Meu treino', icon: <Dumbbell size={18} />, f: 'training_list' },
    { id: 'progress', g: 'evo', to: '/progresso', label: 'Progresso', icon: <TrendingUp size={18} />, f: 'player_stats' },
    { id: 'recs', g: 'evo', to: '/recomendacoes', label: 'Recomendadas', icon: <Target size={18} />, f: 'recommendations_all' },
    isOn(plan, 'challenges') && { id: 'challenges', g: 'evo', to: '/desafios', label: 'Desafios', icon: <Trophy size={18} /> },
    isOn(plan, 'day_report') && { id: 'day', g: 'game', to: '/dia', label: 'Diário de Treino', icon: <CalendarCheck size={18} />, f: 'day_report' },
    { id: 'recent', g: 'game', to: '/recentes', label: 'Recentes', icon: <History size={18} /> },
    { id: 'titles', g: 'game', to: '/titulos', label: 'Títulos', icon: <Tag size={18} /> },
  ].filter(Boolean), [plan, presence?.online]);

  // linha: fixados primeiro; completa com os mais usados; empate pela ordem padrão
  const row = useMemo(() => {
    const byId = new Map(items.map((x) => [x.id, x]));
    const pinned = pins.map((id) => byId.get(id)).filter(Boolean);
    const rest = items.filter((x) => !pins.includes(x.id))
      .sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0) || DEFAULT.indexOf(a.id) - DEFAULT.indexOf(b.id));
    return [...pinned, ...rest].slice(0, MAX_ROW);
  }, [items, pins, usage]);

  const count = (id) => { const u = read(USE_KEY, {}); u[id] = (u[id] || 0) + 1; write(USE_KEY, u); };
  const togglePin = (id) => setPins((p) => {
    const n = p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-MAX_ROW);
    write(PIN_KEY, n);
    return n;
  });
  const go = (x) => { count(x.id); setOpen(false); nav(x.to); };

  return (
    <>
      <nav className="qrow" aria-label={t('Atalhos')}>
        {row.map((x) => (
          <Link key={x.id} to={x.to} className="qtile" onClick={() => count(x.id)}>
            <span className="qico">{x.icon}{x.n > 0 && <i className="qbadge">{x.n}</i>}{x.f && <LockBadge feature={x.f} className="q-lock" />}</span>
            <span className="qlabel">{t(x.label)}</span>
          </Link>
        ))}
        <button type="button" className="qtile more" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <span className="qico"><LayoutGrid size={18} /></span>
          <span className="qlabel">{t('Mais')}</span>
        </button>
      </nav>
      {open && <Sheet items={items} pins={pins} onPin={togglePin} onGo={go} onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({ items, pins, onPin, onGo, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet qsheet" role="dialog" aria-modal="true" aria-label={t('Atalhos')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <span className="sheet-grip" aria-hidden />
          <b>{t('Atalhos')}</b>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Fechar')}><X size={18} /></button>
        </div>
        <div className="sheet-body">
          {GROUPS.map(([g, label]) => {
            const list = items.filter((x) => x.g === g);
            if (!list.length) return null;
            return (
              <section key={g}>
                <h4>{t(label)}</h4>
                <div className="qgrid">
                  {list.map((x) => (
                    <div key={x.id} className="qcell">
                      <button type="button" className="qtile" onClick={() => onGo(x)}>
                        <span className="qico">{x.icon}{x.n > 0 && <i className="qbadge">{x.n}</i>}{x.f && <LockBadge feature={x.f} className="q-lock" />}</span>
                        <span className="qlabel">{t(x.label)}</span>
                      </button>
                      <button type="button" className={`qpin ${pins.includes(x.id) ? 'on' : ''}`} onClick={() => onPin(x.id)}
                        aria-pressed={pins.includes(x.id)} aria-label={pins.includes(x.id) ? t('Tirar do início') : t('Fixar no início')}>
                        <Star size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <p className="muted tiny">{t('Toque na estrela para fixar até 4 atalhos no início. Sem fixar, aparecem os que você mais usa.')}</p>
        </div>
      </div>
    </div>
  );
}

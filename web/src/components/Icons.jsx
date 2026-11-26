// Ícones do app: marca própria do PIU Stats, setas no estilo do pad da Pump e ícones de linha (lucide).
export {
  Bell, Check, CheckCheck, ChevronDown, ChevronRight, ChevronUp, CircleCheck, Gamepad2, Home as HomeIcon, ListOrdered,
  MapPin, MessageCircle, Music2, PencilLine, Play, RefreshCw, Settings as SettingsIcon, SkipForward, Swords, Tag,
  Target, ArrowUpToLine, Users, X, LayoutGrid, History, Radio, LifeBuoy, Crown, ShieldCheck, ShieldOff, UserX, UserCheck,
  Flag, Ban, Trash2, Lock, TrendingUp, Plus, ThumbsUp, ThumbsDown, Vote, Clock, Flame, Trophy, CalendarCheck, Gift, ToggleRight,
  Dumbbell, BookmarkPlus, BookmarkCheck, Zap, Shuffle, Sparkles, Star, Minus,
} from 'lucide-react';

/** Marca do PIU Stats: a seta do pad (estilo LX) em verde, sobre o fundo escuro. */
const MARK = ['92,420 92,158 152,218 152,360 294,360 354,420', '184,328 184,168 232,216 232,280 296,280 344,328'];
const SHAFT = '223,235 377,81 431,135 277,289';
export function Logo({ size = 22 }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="ps-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d2ff7a" />
          <stop offset=".5" stopColor="#8cff3a" />
          <stop offset="1" stopColor="#2fb866" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="#0e0f12" />
      <g transform="translate(256 256) scale(.92) translate(-256 -256)">
        {[...MARK, SHAFT].map((p) => <polygon key={p} points={p} fill="#e2ffc0" stroke="#e2ffc0" strokeWidth="30" />)}
        {[...MARK, SHAFT].map((p) => <polygon key={p} points={p} fill="#05070d" stroke="#05070d" strokeWidth="15" />)}
        <polygon points={SHAFT} fill="url(#ps-g)" />
        {MARK.map((p) => <polygon key={p} points={p} fill="url(#ps-g)" stroke="#05070d" strokeWidth="10" paintOrder="stroke" />)}
      </g>
    </svg>
  );
}

const ARROW_ROT = { ul: -45, ur: 45, dl: -135, dr: 135, c: 0 };
const ARROW_COLOR = { ul: '#ff4b4b', ur: '#ff4b4b', dl: '#3b8bff', dr: '#3b8bff', c: '#ffd23f' };

/** Seta de um painel do pad (diagonais azuis/vermelhas e centro amarelo), para decoração. */
export function PadArrow({ dir = 'ul', size = 28, color }) {
  const c = color || ARROW_COLOR[dir];
  if (dir === 'c') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect x="6" y="6" width="20" height="20" rx="4" fill="none" stroke={c} strokeWidth="3" />
        <rect x="12" y="12" width="8" height="8" rx="1.5" fill={c} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ transform: `rotate(${ARROW_ROT[dir]}deg)` }}>
      <path d="M16 3 L27 15 H20.5 V29 H11.5 V15 H5 Z" fill="none" stroke={c} strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}

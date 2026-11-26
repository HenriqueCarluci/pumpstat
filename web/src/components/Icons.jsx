// Ícones do app: marca própria do StepClub, setas no estilo do pad da Pump e ícones de linha (lucide).
export {
  Bell, Check, CheckCheck, ChevronDown, ChevronRight, ChevronUp, CircleCheck, Gamepad2, Home as HomeIcon, ListOrdered,
  MapPin, MessageCircle, Music2, PencilLine, Play, RefreshCw, Settings as SettingsIcon, SkipForward, Swords, Tag,
  Target, ArrowUpToLine, Users, X, LayoutGrid, History, Radio, LifeBuoy, Crown, ShieldCheck, ShieldOff, UserX, UserCheck,
  Flag, Ban, Trash2, Lock, TrendingUp,
} from 'lucide-react';

/** Marca do StepClub: o painel central do pad com uma seta, em gradiente. */
export function Logo({ size = 22 }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="sc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b6ff5c" />
          <stop offset="1" stopColor="#2bd2ff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#sc-g)" />
      <path d="M16 7.5 L24 17 H19.2 V24.5 H12.8 V17 H8 Z" fill="#0f1114" />
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

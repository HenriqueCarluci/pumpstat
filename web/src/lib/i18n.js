// Idiomas do StepClub. O texto em português é a própria chave: t('Músicas') → 'Songs' em inglês.
// Variáveis entre chaves: t('{n} recordes', { n: 12 }). Sem tradução, fica o português.
// cada idioma vira um arquivo separado e só é baixado quando escolhido
const LOADERS = import.meta.glob('./locales/*.json', { import: 'default' });

export const LANGS = [
  { id: 'pt', name: 'Português', locale: 'pt-BR' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'ko', name: '한국어', locale: 'ko-KR' },
  { id: 'ja', name: '日本語', locale: 'ja-JP' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
];
const DICTS = {};
const KEY = 'stepclub:lang';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some((l) => l.id === saved)) return saved;
  } catch { /* sem armazenamento */ }
  const nav = (navigator.languages || [navigator.language || 'pt']).map((l) => l.slice(0, 2).toLowerCase());
  return nav.find((l) => LANGS.some((x) => x.id === l)) || 'pt';
}

let current = detect();
const listeners = new Set();
applyDocument();

function applyDocument() {
  if (typeof document !== 'undefined') document.documentElement.lang = LANGS.find((l) => l.id === current).locale;
}

export const getLang = () => current;
export const locale = () => LANGS.find((l) => l.id === current).locale;

/** Baixa o dicionário do idioma (se ainda não estiver carregado). */
export async function loadLang(id = current) {
  if (id === 'pt' || DICTS[id]) return;
  const load = LOADERS[`./locales/${id}.json`];
  if (load) DICTS[id] = await load();
}

export async function setLang(id) {
  if (!LANGS.some((l) => l.id === id) || id === current) return;
  try { await loadLang(id); } catch { return; }
  current = id;
  try { localStorage.setItem(KEY, id); } catch { /* ignora */ }
  applyDocument();
  listeners.forEach((f) => f(id));
}
export const onLang = (f) => { listeners.add(f); return () => listeners.delete(f); };

export function t(text, vars) {
  let s = (current !== 'pt' && DICTS[current]?.[text]) || text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

/** Plural simples: tn(n, '{n} voto', '{n} votos'). */
export const tn = (n, one, many, vars) => t(n === 1 ? one : many, { n, ...vars });

export const fmtNum = (n, opts) => (n == null ? '—' : Number(n).toLocaleString(locale(), opts));

/** Mensagens de erro do servidor (em português) traduzidas quando conhecidas. */
export const tErr = (msg) => t(msg || '');

// mensagens de andamento da sincronização (vêm do servidor em português)
const JOB_PATTERNS = [
  [/^(.+): lendo perfil…$/, '{v}: lendo perfil…', ['v']],
  [/^(.+): recordes (\d+)\/(\d+) páginas$/, '{v}: recordes {a}/{b} páginas', ['v', 'a', 'b']],
  [/^(.+): jogadas recentes…$/, '{v}: jogadas recentes…', ['v']],
  [/^(.+): títulos…$/, '{v}: títulos…', ['v']],
  [/^(.+): abrindo a sessão…$/, '{v}: abrindo a sessão…', ['v']],
  [/^(.+): gravando (\d+) recordes…$/, '{v}: gravando {a} recordes…', ['v', 'a']],
  [/^piugame: (.+)$/, 'piugame: {v}', ['v']],
];
export function tMsg(msg) {
  if (!msg) return '';
  for (const [re, key, names] of JOB_PATTERNS) {
    const m = msg.match(re);
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return t(msg);
}

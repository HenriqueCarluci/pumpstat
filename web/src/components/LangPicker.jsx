import { getLang, LANGS, setLang, t } from '../lib/i18n.js';

/** Seletor de idioma (troca na hora e fica salvo no aparelho). */
export default function LangPicker({ compact = false }) {
  return (
    <label className={`langpick ${compact ? 'compact' : ''}`}>
      {!compact && <span>{t('Idioma')}</span>}
      <select value={getLang()} onChange={(e) => setLang(e.target.value)} aria-label={t('Idioma')}>
        {LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  );
}

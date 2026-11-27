import { getLang } from '../lib/i18n.js';
import { EN, PT } from '../lib/privacyText.js';

// Política de privacidade (pública, sem login). Português e inglês; os outros idiomas mostram a versão em inglês.
export default function Privacy() {
  const doc = getLang() === 'pt' ? PT : EN;
  return (
    <div className="page privacy">
      <h1>{doc.title}</h1>
      <p className="muted small">{doc.updated}</p>
      {doc.sections.map(([h, p]) => (
        <section key={h}><h3>{h}</h3><p>{p}</p></section>
      ))}
    </div>
  );
}

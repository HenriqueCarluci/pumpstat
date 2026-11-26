import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { getLang, loadLang, onLang } from './lib/i18n.js';
import './styles.css';
import { watchUpdates } from './lib/updater.js';

// trocar o idioma remonta o app inteiro com os textos novos
function Root() {
  const [lang, setLang] = useState(getLang);
  const [ready, setReady] = useState(getLang() === 'pt');
  useEffect(() => { loadLang().finally(() => setReady(true)); return onLang(setLang); }, []);
  if (!ready) return null;
  return <App key={lang} />;
}

watchUpdates();
createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);

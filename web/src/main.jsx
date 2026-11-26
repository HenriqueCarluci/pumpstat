import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { getLang, onLang } from './lib/i18n.js';
import './styles.css';

// trocar o idioma remonta o app inteiro com os textos novos
function Root() {
  const [lang, setLang] = useState(getLang);
  useEffect(() => onLang(setLang), []);
  return <App key={lang} />;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);

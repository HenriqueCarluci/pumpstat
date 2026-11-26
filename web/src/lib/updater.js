// Detecta versão nova publicada (o navegador às vezes guarda o index.html antigo) e recarrega.
const current = () => [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-.*\.js$/.test(s))?.split('/assets/')[1];

async function latest() {
  try {
    const html = await fetch(`${import.meta.env.BASE_URL}index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    return html.match(/assets\/(index-[^"]+\.js)/)?.[1] || null;
  } catch { return null; }
}

/** Confere ao abrir, ao voltar para a aba e a cada 10 min. Se mudou, recarrega quando a aba estiver em segundo plano ou na volta. */
export function watchUpdates() {
  const mine = current();
  if (!mine) return;
  let pending = false;
  // URL nova (com a versão) força o navegador a buscar o index.html atualizado
  const go = () => window.location.replace(`${window.location.pathname}?v=${pending}${window.location.hash}`);
  const check = async () => {
    const l = await latest();
    if (l && l !== mine) pending = l.replace(/^index-|\.js$/g, '');
    if (pending && (document.hidden || !document.hasFocus())) go();
  };
  const onVisible = () => { if (!document.hidden) { if (pending) go(); else check(); } };
  check().then(() => { if (pending) go(); });
  document.addEventListener('visibilitychange', onVisible);
  setInterval(check, 10 * 60 * 1000);
}

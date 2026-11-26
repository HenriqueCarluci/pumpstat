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
  const check = async () => {
    const l = await latest();
    if (l && l !== mine) pending = true;
    if (pending && (document.hidden || !document.hasFocus())) window.location.reload();
  };
  const onVisible = () => { if (!document.hidden) { if (pending) window.location.reload(); else check(); } };
  check().then(() => { if (pending) window.location.reload(); });
  document.addEventListener('visibilitychange', onVisible);
  setInterval(check, 10 * 60 * 1000);
}

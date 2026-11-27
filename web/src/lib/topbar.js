// Mede a barra do topo e expõe a altura em --topbar-h, para cabeçalhos fixos (ex.: busca da lista de músicas) ficarem logo abaixo dela.
export function watchTopbar() {
  if (typeof window === 'undefined' || !window.ResizeObserver) return;
  let ro = null; let el = null;
  const apply = () => { if (el) document.documentElement.style.setProperty('--topbar-h', `${Math.round(el.getBoundingClientRect().height)}px`); };
  const attach = () => {
    const next = document.querySelector('.topbar');
    if (next === el) return;
    ro?.disconnect(); el = next;
    if (el) { ro = new ResizeObserver(apply); ro.observe(el); apply(); }
  };
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; attach(); }); })
    .observe(document.body, { childList: true, subtree: true });
  attach();
}
watchTopbar();

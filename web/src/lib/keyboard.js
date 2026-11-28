// Teclado do celular: enquanto se digita, a barra de abas de baixo some (no app ela ficava por cima da caixa
// de mensagem) e o campo em foco é rolado para ficar visível acima do teclado.
const TEXT = /^(text|search|email|url|tel|number|password)$/;
const isTyping = (el) => !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable
  || (el.tagName === 'INPUT' && TEXT.test(el.type || 'text')));
const touch = () => window.matchMedia?.('(pointer: coarse)').matches;

function reveal() {
  const el = document.activeElement;
  if (!isTyping(el)) return;
  try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { el.scrollIntoView(false); }
}

let off = null;
document.addEventListener('focusin', (e) => {
  if (!touch() || !isTyping(e.target)) return;
  clearTimeout(off);
  document.documentElement.classList.add('kb-open');
  // o teclado leva um instante para abrir e a tela encolher
  setTimeout(reveal, 300);
  setTimeout(reveal, 650);
});
document.addEventListener('focusout', () => {
  clearTimeout(off);
  off = setTimeout(() => { if (!isTyping(document.activeElement)) document.documentElement.classList.remove('kb-open'); }, 120);
});
window.visualViewport?.addEventListener('resize', () => { if (document.documentElement.classList.contains('kb-open')) reveal(); });

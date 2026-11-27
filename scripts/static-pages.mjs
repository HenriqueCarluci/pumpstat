// Gera páginas estáticas públicas (sem JavaScript) depois do build:
//   /sobre/        página inicial do PIU Stats (exigida pela verificação de marca do login com Google)
//   /privacidade/  política de privacidade, com o mesmo texto da tela do app
import { mkdirSync, writeFileSync } from 'node:fs';
import { EN, PT } from '../web/src/lib/privacyText.js';

const OUT = 'dist';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CSS = `
:root { color-scheme: dark; --bg: #121317; --panel: #1c1e24; --line: #2c2f37; --text: #eef0f4; --muted: #a2a7b3; --neon: #8cff3a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.55 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--neon); }
.wrap { max-width: 920px; margin: 0 auto; padding: 24px 20px 48px; }
header.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0 24px; }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 22px; color: var(--text); text-decoration: none; letter-spacing: .02em; }
.brand img { width: 36px; height: 36px; border-radius: 9px; }
.btn { display: inline-flex; align-items: center; justify-content: center; padding: 11px 18px; border-radius: 12px; font-weight: 700; text-decoration: none; }
.btn.main { background: linear-gradient(90deg, #8cff3a, #3ee08f); color: #0b0c0e; }
.btn.ghost { border: 1px solid var(--line); color: var(--text); }
.hero h1 { font-size: clamp(30px, 6vw, 46px); line-height: 1.1; margin: 8px 0 12px; }
.hero p { color: var(--muted); font-size: 18px; max-width: 640px; }
.cta { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin: 32px 0; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; }
.card h3 { margin: 0 0 6px; font-size: 17px; }
.card p { margin: 0; color: var(--muted); font-size: 15px; }
.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 8px 0 32px; }
.shots img { width: 100%; height: auto; border-radius: 14px; border: 1px solid var(--line); }
h2 { font-size: 22px; margin: 32px 0 12px; }
footer { border-top: 1px solid var(--line); margin-top: 40px; padding-top: 18px; color: var(--muted); font-size: 14px; display: flex; flex-wrap: wrap; gap: 8px 18px; }
.doc h1 { font-size: 30px; margin: 0 0 4px; }
.doc section { margin: 20px 0; }
.doc h3 { margin: 0 0 6px; }
.doc p { margin: 0; color: #cfd3dc; }
.lang { color: var(--muted); font-size: 14px; }
`;

const page = ({ title, desc, path, body }) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://piustats.com.br${path}">
<link rel="icon" href="/icons/icon-192.png">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://piustats.com.br/icons/icon-512.png">
<style>${CSS}</style>
</head>
<body><div class="wrap">
<header class="top"><a class="brand" href="/sobre/"><img src="/icons/icon-192.png" alt="">PIU Stats</a><a class="btn ghost" href="/">Abrir o app</a></header>
${body}
<footer><span>PIU Stats · piustats.com.br</span><a href="/sobre/">Sobre</a><a href="/privacidade/">Política de privacidade</a><span>Pump It Up é marca da Andamiro. O PIU Stats é um projeto independente, sem vínculo com a Andamiro.</span></footer>
</div></body></html>
`;

const FEATURES = [
  ['Seus recordes num lugar só', 'Conecte sua conta AM.PASS da Pump It Up e veja recordes, notas, placas e jogadas recentes da Phoenix e da Phoenix 2.'],
  ['PUMBILITY e tier', 'Acompanhe o seu PUMBILITY, as 50 notas que somam pontos e o que falta para a próxima faixa. Veja cada nível organizado por dificuldade.'],
  ['Missões e recomendações', 'Metas novas toda semana no seu nível e sugestões do que jogar para subir o PUMBILITY ou melhorar uma nota.'],
  ['Treino e progresso', 'Marque músicas para treinar, acompanhe tentativas, passes e a evolução ao longo do tempo.'],
  ['Amigos e times', 'Adicione amigos, compare notas, converse, entre no seu time e veja o ranking e o relatório da semana do time.'],
  ['Fila do fliperama', 'Veja quem está jogando agora e entre na fila da máquina pelo celular, com ou sem conta.'],
];

const sobre = page({
  title: 'PIU Stats: seus recordes de Pump It Up',
  desc: 'PIU Stats é um app para jogadores de Pump It Up: recordes, PUMBILITY, tier, missões semanais, recomendações, amigos, times e fila do fliperama.',
  path: '/sobre/',
  body: `
<section class="hero">
  <h1>PIU Stats</h1>
  <p>O app dos jogadores de Pump It Up: seus recordes, o PUMBILITY, missões da semana, recomendações do que jogar, amigos, times e a fila do fliperama, tudo num lugar só.</p>
  <div class="cta"><a class="btn main" href="/">Entrar no PIU Stats</a><a class="btn ghost" href="/#/fila">Ver as filas dos fliperamas</a></div>
</section>
<div class="grid">${FEATURES.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
<h2>Como fica no celular</h2>
<div class="shots">
  <img src="/sobre/feed-02-pumbility.jpg" alt="Tela do PUMBILITY no PIU Stats" loading="lazy">
  <img src="/sobre/feed-03-missoes.jpg" alt="Missões da semana no PIU Stats" loading="lazy">
  <img src="/sobre/feed-05-recomendacoes.jpg" alt="Recomendações do que jogar no PIU Stats" loading="lazy">
  <img src="/sobre/feed-07-online.jpg" alt="Jogadores online e fila do fliperama no PIU Stats" loading="lazy">
</div>
<h2>Como entrar</h2>
<div class="card"><p>Crie a conta com e-mail e senha ou entre com o Google. Depois, conecte a sua conta AM.PASS da Pump It Up em Ajustes para importar seus recordes. O login com Google serve só para identificar você no PIU Stats: usamos o seu nome e e-mail, e nada mais da sua conta Google.</p></div>
<h2 lang="en">About PIU Stats (English)</h2>
<div class="card" lang="en"><p>PIU Stats is an independent companion app for Pump It Up players. It imports your scores from your AM.PASS account and shows your PUMBILITY, tier lists, weekly missions, play recommendations, training progress, friends, teams and arcade queues. Google sign-in is used only to identify you in PIU Stats (name and e-mail). Available in Portuguese, English, Spanish, Korean, Japanese, French and Italian.</p></div>
`,
});

const docHtml = (d, lang) => `<article class="doc" lang="${lang}"><h1>${esc(d.title)}</h1><p class="lang">${esc(d.updated)}</p>${d.sections.map(([h, p]) => `<section><h3>${esc(h)}</h3><p>${esc(p)}</p></section>`).join('')}</article>`;
const privacidade = page({
  title: 'Política de privacidade do PIU Stats',
  desc: 'Como o PIU Stats coleta, usa e protege os seus dados.',
  path: '/privacidade/',
  body: `${docHtml(PT, 'pt-BR')}<p class="lang"><a href="#en">English version below</a></p><hr style="border-color:#2c2f37;margin:32px 0" id="en">${docHtml(EN, 'en')}`,
});

for (const [dir, html] of [['sobre', sobre], ['privacidade', privacidade]]) {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  writeFileSync(`${OUT}/${dir}/index.html`, html);
  writeFileSync(`${OUT}/${dir}.html`, html);
}
console.log('páginas estáticas: /sobre/ e /privacidade/');

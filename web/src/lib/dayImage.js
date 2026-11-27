// Imagem do "Meu dia de jogo", desenhada no canvas: feed (1080 × 1350) ou stories (1080 × 1920).
// Capas, grades e plates vêm da Pump pelo repasse da nossa API (/api/img), para o canvas poder exportar.
import { fmtNum, locale, t } from './i18n.js';
import { isNative } from './native.js';
import { API_URL } from './config.js';
import { gradeImgUrl, plateImgUrl } from '../components/ui.jsx';

export const FORMATS = { feed: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } };
const MODE_COLOR = { S: '#ff6a3d', D: '#3ddc84', HD: '#b06cff', C: '#ffd23f' };
const NEON = '#8cff3a';
// primeiro passe (nunca tinha passado) e upscore (já tinha passado, melhorou o score): cores próprias para não confundir
const CLEAR = '#ffd23f';
const UP = '#38e1ff';
const kindTag = (r) => (r.kind === 'clear' || r.newClear
  ? [`★ ${t('Primeiro passe')}`, CLEAR]
  : (r.kind === 'pb' || r.pb) ? [`▲ ${t('Upscore')} +${fmtNum(r.delta)}`, UP] : null);
const TXT = '#f2f3f5';
const MUTED = '#a3a6b0';
const NUM = "'Oxanium', 'Pretendard', system-ui, sans-serif";
const SANS = "'Pretendard', system-ui, -apple-system, 'Segoe UI', sans-serif";

const proxied = (u) => (u ? `${API_URL}/api/img?u=${encodeURIComponent(u)}` : null);
const loadImg = (src) => new Promise((ok) => {
  if (!src) { ok(null); return; }
  const i = new Image(); i.crossOrigin = 'anonymous';
  let tm = null;
  const done = (v) => { clearTimeout(tm); ok(v); };
  tm = setTimeout(() => done(null), 8000);
  i.onload = () => done(i); i.onerror = () => done(null); i.src = src;
});

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}
/** Desenha a imagem cobrindo a área (corta o excesso), com cantos arredondados. */
function cover(ctx, img, x, y, w, h, r) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  if (img) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * s; const ih = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  } else { ctx.fillStyle = '#23262e'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
function contain(ctx, img, x, y, w, h) {
  if (!img) return false;
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  ctx.drawImage(img, x + (w - img.naturalWidth * s) / 2, y + (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return true;
}

const MODE_NAME = { S: 'SINGLE', D: 'DOUBLE', HD: 'HALF-DOUBLE', C: 'CO-OP' };
// PERFECT, GREAT, GOOD, BAD, MISS com nome completo (como na tela de detalhes da jogada)
const JUDG_FULL = [['perfect', 'PERFECT', '#8fd3ff'], ['great', 'GREAT', '#9bef7d'], ['good', 'GOOD', '#ffd76a'], ['bad', 'BAD', '#c59bff'], ['miss', 'MISS', '#ff7f86']];
const CARD_H = 244; const CARD_H_SHORT = 176;
const hasJudg = (r) => r.best && r.best.perfect != null;
const cardH = (r) => (hasJudg(r) ? CARD_H : CARD_H_SHORT);

/** Bolinha do nível: aro na cor do modo, SINGLE/DOUBLE em cima e o número grande. */
function levelBall(ctx, chart, cx, cy, R) {
  const col = MODE_COLOR[chart.mode] || TXT;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, `${col}ee`); g.addColorStop(0.7, `${col}88`); g.addColorStop(1, '#0d0f13');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = R * 0.12; ctx.strokeStyle = '#d9dde4'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(R * 0.26)}px ${SANS}`; ctx.fillText(MODE_NAME[chart.mode] || chart.mode, cx, cy - R * 0.36);
  ctx.font = `900 ${Math.round(R * 0.92)}px ${NUM}`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.65)';
  ctx.strokeText(String(chart.level), cx, cy + R * 0.42); ctx.fillText(String(chart.level), cx, cy + R * 0.42);
  ctx.restore();
}

/** Texto que cabe: tenta a fonte maior e vai diminuindo até o mínimo antes de cortar com reticências. */
function fitFont(ctx, text, max, weight, size, min, family) {
  for (let sz = size; sz >= min; sz -= 2) { ctx.font = `${weight} ${sz}px ${family}`; if (ctx.measureText(text).width <= max) return text; }
  return fit(ctx, text, max);
}

/** Linha de apoio de cada chart: o que aconteceu nele no dia. */
function detailLine(r) {
  if (r.newClear || r.kind === 'clear') return r.triesBefore ? t('Passou depois de {n} tentativas', { n: r.triesBefore + r.tries }) : tn2(r.tries);
  if (r.pb || r.kind === 'pb') return [t('antes {s}', { s: fmtNum(r.prevScore) }), r.gradeUp && `${r.prevGrade} → ${r.grade}`].filter(Boolean).join(' · ');
  return r.prevScore != null ? t('Recorde: {s}', { s: fmtNum(r.prevScore) }) : tn2(r.tries);
}
const tn2 = (n) => (n > 1 ? t('{n} tentativas', { n }) : t('Passou de primeira'));

/** Cartão de um chart, no padrão da tela de detalhes da jogada: capa ao fundo, nome completo, bolinha do nível, score e julgamentos. */
function drawCard(ctx, r, x, y, w, h, jkImg, gdImg, plImg) {
  const kt = kindTag(r);
  ctx.save(); rr(ctx, x, y, w, h, 28); ctx.clip();
  ctx.fillStyle = '#15171d'; ctx.fillRect(x, y, w, h);
  if (jkImg) { ctx.globalAlpha = 0.5; cover(ctx, jkImg, x, y, w, h, 0); ctx.globalAlpha = 1; }
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, 'rgba(14,15,19,.93)'); g.addColorStop(0.55, 'rgba(14,15,19,.80)'); g.addColorStop(1, 'rgba(14,15,19,.62)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  rr(ctx, x, y, w, h, 28); ctx.lineWidth = 3; ctx.strokeStyle = kt ? `${kt[1]}aa` : 'rgba(255,255,255,.22)'; ctx.stroke();

  const P = 22;
  // etiqueta (primeiro passe / upscore) no canto
  let pillW = 0;
  if (kt) {
    ctx.font = `800 21px ${SANS}`; pillW = ctx.measureText(kt[0]).width + 28;
    rr(ctx, x + w - P - pillW, y + P - 4, pillW, 38, 19); ctx.fillStyle = `${kt[1]}26`; ctx.fill();
    ctx.strokeStyle = `${kt[1]}99`; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = kt[1]; ctx.fillText(kt[0], x + w - P - pillW + 14, y + P + 22);
  }
  // nome completo
  ctx.fillStyle = TXT;
  const title = fitFont(ctx, r.chart.song.title, w - P * 2 - pillW - 18, 800, 32, 24, SANS);
  ctx.fillText(title, x + P, y + P + 26);

  // bolinha, score, detalhe, grade e plate
  const R = 42; const my = y + P + 42;
  levelBall(ctx, r.chart, x + P + R, my + R, R);
  const sx = x + P + R * 2 + 24;
  ctx.fillStyle = TXT; ctx.font = `800 52px ${NUM}`; ctx.fillText(fmtNum(r.score), sx, my + 50);
  ctx.fillStyle = MUTED; ctx.font = `600 21px ${SANS}`;
  const gw = 118;
  ctx.fillText(fit(ctx, detailLine(r), x + w - P - gw - 16 - sx), sx, my + 80);
  const gx = x + w - P - gw;
  if (!contain(ctx, gdImg, gx, my - 2, gw, gw * 0.6)) {
    ctx.textAlign = 'right'; ctx.fillStyle = TXT; ctx.font = `800 44px ${NUM}`; ctx.fillText(r.grade || '', x + w - P, my + 44); ctx.textAlign = 'left';
  }
  if (r.plate && !contain(ctx, plImg, gx, my + gw * 0.6 + 2, gw, gw * 0.3)) {
    ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = `800 24px ${NUM}`; ctx.fillText(r.plate, x + w - P, my + 92); ctx.textAlign = 'left';
  }

  // PERFECT / GREAT / GOOD / BAD / MISS da melhor jogada do dia
  if (hasJudg(r)) {
    const b = r.best; const by = my + R * 2 + 10; const bh = 60; const bg = 10;
    const bw = (w - P * 2 - bg * 4) / 5;
    JUDG_FULL.forEach(([k, label, col], i) => {
      const bx = x + P + i * (bw + bg);
      rr(ctx, bx, by, bw, bh, 14); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = col;
      ctx.font = `800 17px ${SANS}`; ctx.fillText(label, bx + bw / 2, by + 23);
      ctx.font = `800 29px ${NUM}`; ctx.fillText(fmtNum(b[k] || 0), bx + bw / 2, by + 52);
      ctx.textAlign = 'left';
    });
  }
}

const loadCardImgs = (rows) => Promise.all(rows.flatMap((r) => [loadImg(proxied(r.chart.song.jacket)), loadImg(proxied(gradeImgUrl(r.grade))), loadImg(proxied(plateImgUrl(r.plate)))]));

/** Quantos itens (com títulos de grupo) cabem numa altura. */
function takeFitting(groups, avail, gap, GH) {
  const out = []; let used = 0;
  for (const [label, col, rows] of groups) {
    const taken = [];
    for (const r of rows) {
      const need = (taken.length ? 0 : GH) + cardH(r) + gap;
      if (used + need > avail) break;
      used += need; taken.push(r);
    }
    if (taken.length) out.push([label, col, taken]);
    if (taken.length < rows.length) break;
  }
  return out;
}

/** Desenha a capa do dia (números e destaques) e devolve um PNG e quantos destaques couberam. */
export async function drawDayImage({ rep, nickname, versionName, dayLabel, list, format = 'feed', pageLabel = null }) {
  const F = FORMATS[format] || FORMATS.feed;
  const W = F.w; const H = F.h;
  try { await Promise.all([document.fonts?.load(`800 40px ${NUM}`), document.fonts?.load(`700 30px ${SANS}`)]); } catch { /* fonte do sistema */ }
  const M = 60; const foot = 96; const gap = 14; const GH = 48; const top = 404;
  const allGroups = [
    [`★ ${t('Primeiros passes')}`, CLEAR, list.filter((r) => r.kind === 'clear')],
    [`▲ ${t('Upscores')}`, UP, list.filter((r) => r.kind === 'pb')],
    [t('Melhores passes do dia'), TXT, list.filter((r) => r.kind === 'pass')],
  ].filter((g) => g[2].length);
  const groups = takeFitting(allGroups, H - foot - 10 - top, gap, GH);
  const items = groups.flatMap((g) => g[2]);
  const [logo, ...imgs] = await Promise.all([loadImg(new URL('icons/icon-192.png', document.baseURI).href), ...await loadCardImgs(items)]);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  background(ctx, W, H, imgs[0]);

  // cabeçalho
  if (logo) { ctx.save(); rr(ctx, M, 56, 84, 84, 22); ctx.clip(); ctx.drawImage(logo, M, 56, 84, 84); ctx.restore(); }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = NEON; ctx.font = `800 24px ${SANS}`;
  ctx.fillText(t('Dia de jogo').toUpperCase(), M + 104, 88);
  ctx.fillStyle = TXT; ctx.font = `800 44px ${SANS}`;
  ctx.fillText(fit(ctx, nickname || 'PIU Stats', W - M * 2 - 104 - 300), M + 104, 136);
  ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = `600 24px ${SANS}`;
  ctx.fillText(dayLabel, W - M, 88);
  ctx.fillText(versionName, W - M, 124);
  ctx.textAlign = 'left';

  // números do dia: 4 cartões com nome completo
  const tt = rep.totals;
  const kpis = [
    [t('Jogadas'), fmtNum(tt.plays), null, TXT],
    [t('Passes'), fmtNum(tt.passes), `${Math.round(tt.rate * 100)}%`, TXT],
    [t('Primeiros passes'), fmtNum(tt.newClears), null, tt.newClears ? CLEAR : TXT],
    [t('Upscores'), fmtNum(tt.pbs), null, tt.pbs ? UP : TXT],
  ];
  const kw = (W - M * 2 - 3 * 16) / 4; const ky = 172;
  kpis.forEach(([label, val, sub, col], i) => {
    const x = M + i * (kw + 16);
    rr(ctx, x, ky, kw, 124, 22); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = MUTED; ctx.fillText(fitFont(ctx, label, kw - 36, 600, 21, 16, SANS), x + 20, ky + 38);
    ctx.fillStyle = col; ctx.font = `800 54px ${NUM}`; ctx.fillText(val, x + 20, ky + 100);
    if (sub) { const vw = ctx.measureText(val).width; ctx.fillStyle = MUTED; ctx.font = `700 24px ${NUM}`; ctx.fillText(sub, x + 28 + vw, ky + 100); }
  });

  // selos: maior D/S, acerto, tempo
  const chips = [
    tt.maxD && [t('Maior Double'), `D${tt.maxD}`, MODE_COLOR.D],
    tt.maxS && [t('Maior Single'), `S${tt.maxS}`, MODE_COLOR.S],
    tt.accuracy != null && [t('Acerto'), `${(tt.accuracy * 100).toFixed(1)}%`, TXT],
    tt.first && tt.last && tt.last > tt.first && [t('Tempo'), `${Math.round((tt.last - tt.first) / 60)} min`, TXT],
  ].filter(Boolean);
  let cx = M; const cy = 314;
  for (const [label, val, col] of chips) {
    ctx.font = `600 20px ${SANS}`; const lw = ctx.measureText(label).width;
    ctx.font = `800 26px ${NUM}`; const vw = ctx.measureText(val).width;
    const w = lw + vw + 50;
    if (cx + w > W - M) break;
    rr(ctx, cx, cy, w, 52, 26); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
    ctx.fillStyle = MUTED; ctx.font = `600 20px ${SANS}`; ctx.fillText(label, cx + 20, cy + 33);
    ctx.fillStyle = col; ctx.font = `800 26px ${NUM}`; ctx.fillText(val, cx + 30 + lw, cy + 35);
    cx += w + 12;
  }

  // destaques em grupos, cada chart no cartão completo
  let y = top; let i = 0;
  for (const [label, col, rows] of groups) {
    ctx.fillStyle = col; ctx.font = `800 29px ${SANS}`; ctx.fillText(label, M, y + 32); y += GH;
    for (const r of rows) {
      const h = cardH(r);
      drawCard(ctx, r, M, y, W - M * 2, h, imgs[i * 3], imgs[i * 3 + 1], imgs[i * 3 + 2]);
      y += h + gap; i++;
    }
  }
  // espaço sobrando: passes por nível
  let y0 = y + (items.length ? 30 : 80);
  const lv = rep.levels.slice(0, Math.max(0, Math.floor((H - foot - 30 - y0 - 44) / 50)));
  if (lv.length >= 2) {
    ctx.fillStyle = TXT; ctx.font = `800 30px ${SANS}`; ctx.fillText(t('Por nível'), M, y0);
    y0 += 22;
    lv.forEach((l, k) => {
      const yy = y0 + k * 50; const lc = MODE_COLOR[l.mode] || TXT;
      ctx.fillStyle = lc; ctx.font = `800 28px ${NUM}`; ctx.fillText(`${l.mode}${l.level}`, M, yy + 32);
      const bx = M + 100; const bw = W - M * 2 - 100 - 110;
      rr(ctx, bx, yy + 14, bw, 20, 10); ctx.fillStyle = 'rgba(255,90,90,.22)'; ctx.fill();
      if (l.passes) { rr(ctx, bx, yy + 14, Math.max(20, bw * (l.passes / l.tries)), 20, 10); ctx.fillStyle = NEON; ctx.fill(); }
      ctx.textAlign = 'right'; ctx.fillStyle = TXT; ctx.font = `800 26px ${NUM}`; ctx.fillText(`${l.passes}/${l.tries}`, W - M, yy + 32); ctx.textAlign = 'left';
    });
  }
  if (!list.length) {
    ctx.fillStyle = MUTED; ctx.font = `600 30px ${SANS}`;
    ctx.fillText(t('Nenhum passe neste dia. Bora treinar!'), M, top + 40);
  }

  footer(ctx, W, H, M, foot, pageLabel);
  return { blob: await new Promise((ok) => c.toBlob(ok, 'image/png')), shown: items.length };
}

function background(ctx, W, H, img) {
  // fundo: a capa do destaque principal, desfocada e escurecida, com brilho verde
  ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, W, H);
  if (img) {
    ctx.save(); ctx.filter = 'blur(46px) saturate(1.3)'; ctx.globalAlpha = 0.55;
    cover(ctx, img, -80, -80, W + 160, H * 0.62, 0);
    ctx.restore(); ctx.filter = 'none'; ctx.globalAlpha = 1;
  }
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(11,12,15,.35)'); g.addColorStop(0.35, 'rgba(11,12,15,.82)'); g.addColorStop(1, 'rgba(11,12,15,.98)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W, 0, 10, W, 0, 700);
  g.addColorStop(0, 'rgba(140,255,58,.18)'); g.addColorStop(1, 'rgba(140,255,58,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function footer(ctx, W, H, M, foot, pageLabel) {
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(M, H - foot + 10, W - M * 2, 2);
  ctx.fillStyle = MUTED; ctx.font = `600 23px ${SANS}`;
  ctx.fillText(t('Gerado com PIU Stats'), M, H - 38);
  ctx.textAlign = 'right';
  if (pageLabel) { ctx.fillStyle = MUTED; ctx.font = `700 23px ${NUM}`; ctx.fillText(pageLabel, W / 2 + 60, H - 38); }
  ctx.fillStyle = NEON; ctx.font = `800 24px ${NUM}`;
  ctx.fillText('#PumpItUp', W - M, H - 38);
  ctx.textAlign = 'left';
}

const LIST_TOP = 150; const LIST_GAP = 18;
/** Divide os passes em páginas pela altura dos cartões. */
function paginate(rows, H) {
  const avail = H - LIST_TOP - 96 - 10;
  const pages = []; let cur = []; let used = 0;
  for (const r of rows) {
    const need = cardH(r) + LIST_GAP;
    if (cur.length && used + need > avail) { pages.push(cur); cur = []; used = 0; }
    cur.push(r); used += need;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** Página extra: todos os passes do dia, no mesmo cartão da capa. */
async function drawListPage({ rows, nickname, dayLabel, format, page, pages, logo }) {
  const F = FORMATS[format] || FORMATS.feed;
  const W = F.w; const H = F.h; const M = 60; const foot = 96;
  const imgs = await loadCardImgs(rows);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  background(ctx, W, H, imgs[0]);

  if (logo) { ctx.save(); rr(ctx, M, 50, 64, 64, 18); ctx.clip(); ctx.drawImage(logo, M, 50, 64, 64); ctx.restore(); }
  ctx.fillStyle = NEON; ctx.font = `800 22px ${SANS}`;
  ctx.fillText(`${t('Dia de jogo').toUpperCase()} · ${t('Todos os passes')}`, M + 84, 76);
  ctx.fillStyle = TXT; ctx.font = `800 36px ${SANS}`;
  ctx.fillText(fit(ctx, nickname || 'PIU Stats', W - M * 2 - 84 - 260), M + 84, 114);
  ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = `600 24px ${SANS}`;
  ctx.fillText(dayLabel, W - M, 76);
  ctx.font = `800 26px ${NUM}`; ctx.fillStyle = TXT; ctx.fillText(`${page}/${pages}`, W - M, 114);
  ctx.textAlign = 'left';

  let y = LIST_TOP;
  rows.forEach((r, i) => {
    const h = cardH(r);
    drawCard(ctx, r, M, y, W - M * 2, h, imgs[i * 3], imgs[i * 3 + 1], imgs[i * 3 + 2]);
    y += h + LIST_GAP;
  });
  footer(ctx, W, H, M, foot, null);
  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}

/**
 * Todas as imagens do dia: a capa (números e destaques) e, se não couber tudo nela, páginas com todos os passes.
 * Devolve uma lista de PNGs, na ordem de postar (carrossel).
 */
export async function drawDayImages(opts) {
  const format = opts.format || 'feed';
  const F = FORMATS[format] || FORMATS.feed;
  const passes = opts.rep.rows.filter((r) => r.passed)
    .sort((a, b) => b.chart.level - a.chart.level || (b.newClear - a.newClear) || (b.pb - a.pb) || b.score - a.score);
  // a capa sem número de página primeiro, só para saber quantos destaques couberam
  const first = await drawDayImage({ ...opts, format });
  const allOnCover = first.shown >= passes.length && opts.list.every((r) => r.kind === 'pass');
  const listPages = allOnCover ? [] : paginate(passes, F.h);
  const pages = 1 + listPages.length;
  const coverBlob = pages > 1 ? (await drawDayImage({ ...opts, format, pageLabel: `1/${pages}` })).blob : first.blob;
  const logo = await loadImg(new URL('icons/icon-192.png', document.baseURI).href);
  const out = [coverBlob];
  for (let p = 0; p < listPages.length; p++) {
    out.push(await drawListPage({ rows: listPages[p], nickname: opts.nickname, dayLabel: opts.dayLabel, format, page: p + 2, pages, logo }));
  }
  return out;
}

const toBase64 = (blob) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = fail;
  r.readAsDataURL(blob);
});

/** Compartilha uma ou mais imagens: no app, pela folha de compartilhar do Android; no navegador, Web Share ou download. */
export async function shareImage(blobs, filename, text) {
  const list = Array.isArray(blobs) ? blobs : [blobs];
  const names = list.map((_, i) => (list.length > 1 ? filename.replace(/\.png$/, `-${i + 1}.png`) : filename));
  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const uris = [];
    for (let i = 0; i < list.length; i++) {
      const { uri } = await Filesystem.writeFile({ path: names[i], data: await toBase64(list[i]), directory: Directory.Cache });
      uris.push(uri);
    }
    await Share.share({ title: filename, text, files: uris, dialogTitle: t('Compartilhar') });
    return 'shared';
  }
  const files = list.map((b, i) => new File([b], names[i], { type: 'image/png' }));
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
  }
  list.forEach((b, i) => setTimeout(() => downloadImage(b, names[i]), i * 400));
  return 'downloaded';
}

export function downloadImage(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const dayLabelOf = (day, opts = { weekday: 'short', day: '2-digit', month: 'short' }) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale(), opts);

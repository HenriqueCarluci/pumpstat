// Imagem do "Meu dia de jogo", desenhada no canvas: feed (1080 × 1350) ou stories (1080 × 1920).
// Capas, grades e plates vêm da Pump pelo repasse da nossa API (/api/img), para o canvas poder exportar.
import { fmtNum, locale, t } from './i18n.js';
import { isNative } from './native.js';
import { API_URL } from './config.js';
import { gradeImgUrl, plateImgUrl } from '../components/ui.jsx';

export const FORMATS = { feed: { w: 1080, h: 1350, rows: 4 }, story: { w: 1080, h: 1920, rows: 7 } };
const MODE_COLOR = { S: '#ff6a3d', D: '#3ddc84', HD: '#b06cff', C: '#ffd23f' };
const NEON = '#8cff3a';
const TXT = '#f2f3f5';
const MUTED = '#a3a6b0';
const NUM = "'Oxanium', 'Pretendard', system-ui, sans-serif";
const SANS = "'Pretendard', system-ui, -apple-system, 'Segoe UI', sans-serif";
// PERFECT, GREAT, GOOD, BAD, MISS
const JUDG = [['perfect', 'P', '#38e1ff'], ['great', 'GR', '#58e07a'], ['good', 'GD', '#ffd23f'], ['bad', 'B', '#ff9a3c'], ['miss', 'M', '#ff4b5c']];

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

/** Desenha a imagem do dia e devolve um PNG. */
export async function drawDayImage({ rep, nickname, versionName, dayLabel, list, format = 'feed' }) {
  const F = FORMATS[format] || FORMATS.feed;
  const W = F.w; const H = F.h;
  try { await Promise.all([document.fonts?.load(`800 40px ${NUM}`), document.fonts?.load(`700 30px ${SANS}`)]); } catch { /* fonte do sistema */ }
  const items = list.slice(0, F.rows);
  // carrega tudo em paralelo: capas, grades, plates e o logo
  const [logo, ...imgs] = await Promise.all([
    loadImg(new URL('icons/icon-192.png', document.baseURI).href),
    ...items.flatMap((r) => [loadImg(proxied(r.chart.song.jacket)), loadImg(proxied(gradeImgUrl(r.grade))), loadImg(proxied(plateImgUrl(r.plate)))]),
  ]);
  const jk = (i) => imgs[i * 3]; const gd = (i) => imgs[i * 3 + 1]; const pl = (i) => imgs[i * 3 + 2];

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // fundo: a capa do destaque principal, desfocada e escurecida, com brilho verde
  ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, W, H);
  if (jk(0)) {
    ctx.save(); ctx.filter = 'blur(46px) saturate(1.3)'; ctx.globalAlpha = 0.55;
    cover(ctx, jk(0), -80, -80, W + 160, H * 0.62, 0);
    ctx.restore(); ctx.filter = 'none'; ctx.globalAlpha = 1;
  }
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(11,12,15,.35)'); g.addColorStop(0.35, 'rgba(11,12,15,.82)'); g.addColorStop(1, 'rgba(11,12,15,.98)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W, 0, 10, W, 0, 700);
  g.addColorStop(0, 'rgba(140,255,58,.18)'); g.addColorStop(1, 'rgba(140,255,58,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // cabeçalho
  const M = 60;
  if (logo) { ctx.save(); rr(ctx, M, 56, 84, 84, 22); ctx.clip(); ctx.drawImage(logo, M, 56, 84, 84); ctx.restore(); }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = NEON; ctx.font = `800 24px ${SANS}`;
  ctx.fillText(t('Meu dia de jogo').toUpperCase(), M + 104, 88);
  ctx.fillStyle = TXT; ctx.font = `800 44px ${SANS}`;
  ctx.fillText(fit(ctx, nickname || 'PIU Stats', W - M * 2 - 104 - 300), M + 104, 136);
  ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = `600 24px ${SANS}`;
  ctx.fillText(dayLabel, W - M, 88);
  ctx.fillText(versionName, W - M, 124);
  ctx.textAlign = 'left';

  // números do dia (4 cartões)
  const tt = rep.totals;
  const kpis = [
    [t('Jogadas'), fmtNum(tt.plays), null, TXT],
    [t('Passes'), fmtNum(tt.passes), `${Math.round(tt.rate * 100)}%`, TXT],
    [t('Recordes'), fmtNum(tt.pbs), null, tt.pbs ? NEON : TXT],
    [t('Primeiros passes'), fmtNum(tt.newClears), null, tt.newClears ? NEON : TXT],
  ];
  const kw = (W - M * 2 - 3 * 16) / 4; const ky = 184;
  kpis.forEach(([label, val, sub, col], i) => {
    const x = M + i * (kw + 16);
    rr(ctx, x, ky, kw, 132, 24); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = MUTED; ctx.font = `600 21px ${SANS}`; ctx.fillText(fit(ctx, label, kw - 36), x + 20, ky + 40);
    ctx.fillStyle = col; ctx.font = `800 56px ${NUM}`; ctx.fillText(val, x + 20, ky + 106);
    if (sub) { const vw = ctx.measureText(val).width; ctx.fillStyle = MUTED; ctx.font = `700 24px ${NUM}`; ctx.fillText(sub, x + 28 + vw, ky + 106); }
  });

  // linha de selos: maior D/S, acerto, tempo
  const chips = [
    tt.maxD && [t('Maior Double'), `D${tt.maxD}`, MODE_COLOR.D],
    tt.maxS && [t('Maior Single'), `S${tt.maxS}`, MODE_COLOR.S],
    tt.accuracy != null && [t('Acerto'), `${(tt.accuracy * 100).toFixed(1)}%`, TXT],
    tt.first && tt.last && tt.last > tt.first && [t('Tempo'), `${Math.round((tt.last - tt.first) / 60)} min`, TXT],
  ].filter(Boolean);
  let cx = M; const cy = 338;
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

  // destaques
  const kind = items.some((r) => r.kind !== 'pass') ? t('Recordes do dia') : t('Melhores passes do dia');
  ctx.fillStyle = TXT; ctx.font = `800 32px ${SANS}`; ctx.fillText(kind, M, 444);
  const top = 470; const foot = 96; const gap = 16;
  const ch = Math.min(196, (H - top - foot - gap * (F.rows - 1)) / F.rows);
  items.forEach((r, i) => {
    const y = top + i * (ch + gap);
    rr(ctx, M, y, W - M * 2, ch, 26); ctx.fillStyle = 'rgba(20,22,28,.86)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2; ctx.stroke();
    // capa com o nível por cima
    const jh = ch - 28; const jw = Math.round(jh * 16 / 9); const jx = M + 14; const jy = y + 14;
    cover(ctx, jk(i), jx, jy, jw, jh, 18);
    const col = MODE_COLOR[r.chart.mode] || TXT; const lab = `${r.chart.mode}${r.chart.level}`;
    ctx.font = `800 30px ${NUM}`; const lw = ctx.measureText(lab).width + 24;
    rr(ctx, jx + 10, jy + jh - 50, lw, 40, 12); ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(lab, jx + 22, jy + jh - 19);

    // texto
    const tx = jx + jw + 24; const right = W - M - 20;
    const gw = Math.min(112, ch * 0.62);
    const textMax = right - gw - 14 - tx;
    ctx.fillStyle = TXT; ctx.font = `800 31px ${SANS}`;
    ctx.fillText(fit(ctx, r.chart.song.title, textMax), tx, y + 50);
    let tag; let tagCol = NEON;
    if (r.kind === 'clear') tag = `★ ${t('Primeiro passe')}`;
    else if (r.kind === 'pb') tag = `▲ +${fmtNum(r.delta)}${r.gradeUp ? `  ${r.prevGrade} → ${r.grade}` : ''}`;
    else { tag = r.tries > 1 ? t('{n} tentativas', { n: r.tries }) : t('Passou'); tagCol = MUTED; }
    ctx.fillStyle = tagCol; ctx.font = `700 22px ${SANS}`; ctx.fillText(fit(ctx, tag, textMax), tx, y + 82);
    ctx.fillStyle = TXT; ctx.font = `800 40px ${NUM}`; ctx.fillText(fmtNum(r.score), tx, y + 128);

    // PERFECT / GREAT / GOOD / BAD / MISS da melhor jogada do dia
    const b = r.best;
    if (b && b.perfect != null && ch > 150) {
      const tot = JUDG.reduce((a, [k]) => a + (b[k] || 0), 0) || 1;
      const bw = right - tx; const by = y + ch - 44;
      let bx = tx;
      ctx.save(); rr(ctx, tx, by, bw, 10, 5); ctx.clip();
      for (const [k, , cl] of JUDG) { const w = bw * (b[k] || 0) / tot; ctx.fillStyle = cl; ctx.fillRect(bx, by, w, 10); bx += w; }
      ctx.restore();
      let jx2 = tx; ctx.font = `700 19px ${NUM}`;
      for (const [k, l, cl] of JUDG) {
        ctx.fillStyle = cl; ctx.fillText(l, jx2, by + 34); jx2 += ctx.measureText(l).width + 6;
        ctx.fillStyle = TXT; const v = fmtNum(b[k] || 0); ctx.fillText(v, jx2, by + 34); jx2 += ctx.measureText(v).width + 18;
      }
    }
    // grade e plate à direita
    const gx = right - gw; const gy = y + 16;
    if (!contain(ctx, gd(i), gx, gy, gw, gw * 0.62)) {
      ctx.textAlign = 'right'; ctx.fillStyle = TXT; ctx.font = `800 40px ${NUM}`; ctx.fillText(r.grade || '', right, gy + 48); ctx.textAlign = 'left';
    }
    if (r.plate && !contain(ctx, pl(i), gx, gy + gw * 0.62 + 4, gw, gw * 0.34)) {
      ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = `800 24px ${NUM}`; ctx.fillText(r.plate, right, gy + gw * 0.62 + 30); ctx.textAlign = 'left';
    }
  });
  // espaço sobrando: passes por nível
  let y0 = top + items.length * (ch + gap) + (items.length ? 34 : 110);
  const lv = rep.levels.slice(0, Math.max(0, Math.floor((H - foot - 30 - y0 - 44) / 50)));
  if (lv.length >= 2) {
    ctx.fillStyle = TXT; ctx.font = `800 30px ${SANS}`; ctx.fillText(t('Por nível'), M, y0);
    y0 += 22;
    lv.forEach((l, i) => {
      const y = y0 + i * 50; const col = MODE_COLOR[l.mode] || TXT;
      ctx.fillStyle = col; ctx.font = `800 28px ${NUM}`; ctx.fillText(`${l.mode}${l.level}`, M, y + 32);
      const bx = M + 100; const bw = W - M * 2 - 100 - 110;
      rr(ctx, bx, y + 14, bw, 20, 10); ctx.fillStyle = 'rgba(255,90,90,.22)'; ctx.fill();
      if (l.passes) { rr(ctx, bx, y + 14, Math.max(20, bw * (l.passes / l.tries)), 20, 10); ctx.fillStyle = NEON; ctx.fill(); }
      ctx.textAlign = 'right'; ctx.fillStyle = TXT; ctx.font = `800 26px ${NUM}`; ctx.fillText(`${l.passes}/${l.tries}`, W - M, y + 32); ctx.textAlign = 'left';
    });
  }
  if (!items.length) {
    ctx.fillStyle = MUTED; ctx.font = `600 30px ${SANS}`;
    ctx.fillText(t('Nenhum passe neste dia. Bora treinar!'), M, top + 40);
  }

  // rodapé
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(M, H - foot + 10, W - M * 2, 2);
  ctx.fillStyle = MUTED; ctx.font = `600 23px ${SANS}`;
  ctx.fillText(t('Gerado com PIU Stats'), M, H - 38);
  ctx.textAlign = 'right'; ctx.fillStyle = NEON; ctx.font = `800 24px ${NUM}`;
  ctx.fillText('#PumpItUp', W - M, H - 38);
  ctx.textAlign = 'left';

  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}

const toBase64 = (blob) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = fail;
  r.readAsDataURL(blob);
});

/** Compartilha a imagem: no app, pela folha de compartilhar do Android; no navegador, Web Share ou download. */
export async function shareImage(blob, filename, text) {
  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
    await Share.share({ title: filename, text, files: [uri], dialogTitle: t('Compartilhar') });
    return 'shared';
  }
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
  }
  downloadImage(blob, filename);
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

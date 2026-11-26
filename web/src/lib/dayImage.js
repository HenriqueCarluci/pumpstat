// Imagem do dia de jogo (1080 × 1350, formato do feed do Instagram), desenhada no canvas e compartilhada.
import { fmtNum, locale, t } from './i18n.js';
import { isNative } from './native.js';

const W = 1080;
const H = 1350;
const MODE_COLOR = { S: '#ff7a45', D: '#3ddc84', HD: '#b06cff', C: '#ffd23f' };
const NEON = '#8cff3a';
const FONT = "'Oxanium', 'Pretendard', system-ui, sans-serif";
const SANS = "'Pretendard', system-ui, -apple-system, 'Segoe UI', sans-serif";

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
const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

/** Desenha a imagem do dia e devolve um PNG. */
export async function drawDayImage({ rep, nickname, versionName, dayLabel, list }) {
  try { await Promise.all([document.fonts?.load(`800 40px ${FONT}`), document.fonts?.load(`700 30px ${SANS}`)]); } catch { /* usa a fonte do sistema */ }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // fundo escuro com brilho verde no canto
  ctx.fillStyle = '#0e0f12'; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(140, 80, 20, 140, 80, 760);
  g.addColorStop(0, 'rgba(140,255,58,.20)'); g.addColorStop(1, 'rgba(140,255,58,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W, H, 20, W, H, 700);
  g.addColorStop(0, 'rgba(47,184,102,.14)'); g.addColorStop(1, 'rgba(47,184,102,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // cabeçalho: logo, nome do app e data
  const logo = await loadImg(new URL('icons/icon-192.png', document.baseURI).href);
  if (logo) { ctx.save(); rr(ctx, 64, 60, 88, 88, 22); ctx.clip(); ctx.drawImage(logo, 64, 60, 88, 88); ctx.restore(); }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f2f3f5'; ctx.font = `800 40px ${FONT}`;
  ctx.fillText('PIU Stats', 172, 100);
  ctx.fillStyle = NEON; ctx.font = `700 24px ${SANS}`;
  ctx.fillText(t('Dia de jogo').toUpperCase(), 172, 136);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f2f3f5'; ctx.font = `700 30px ${SANS}`;
  ctx.fillText(fit(ctx, nickname || '', 420), W - 64, 100);
  ctx.fillStyle = '#9a9ca6'; ctx.font = `500 24px ${SANS}`;
  ctx.fillText(fit(ctx, `${dayLabel} · ${versionName}`, 520), W - 64, 136);
  ctx.textAlign = 'left';

  // números do dia
  const tt = rep.totals;
  const tiles = [
    [t('Jogadas'), fmtNum(tt.plays)],
    [t('Passes'), `${fmtNum(tt.passes)}`, `${Math.round(tt.rate * 100)}%`],
    [t('Primeiros passes'), fmtNum(tt.newClears)],
    [t('Recordes'), fmtNum(tt.pbs)],
  ];
  const tw = (W - 128 - 3 * 20) / 4;
  tiles.forEach(([label, val, sub], i) => {
    const x = 64 + i * (tw + 20);
    const y = 196;
    rr(ctx, x, y, tw, 150, 26); ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#9a9ca6'; ctx.font = `600 22px ${SANS}`;
    ctx.fillText(fit(ctx, label, tw - 40), x + 22, y + 44);
    ctx.fillStyle = i >= 2 && Number(val) > 0 ? NEON : '#f2f3f5'; ctx.font = `800 60px ${FONT}`;
    ctx.fillText(val, x + 22, y + 116);
    if (sub) {
      const vw = ctx.measureText(val).width;
      ctx.fillStyle = '#9a9ca6'; ctx.font = `700 26px ${FONT}`;
      ctx.fillText(sub, x + 30 + vw, y + 116);
    }
  });

  // linha secundária: maior D, maior S, acerto
  const chips = [
    tt.maxD && [t('Maior Double'), `D${tt.maxD}`, MODE_COLOR.D],
    tt.maxS && [t('Maior Single'), `S${tt.maxS}`, MODE_COLOR.S],
    tt.accuracy != null && [t('Acerto'), `${(tt.accuracy * 100).toFixed(1)}%`, '#f2f3f5'],
    tt.avgLevel != null && [t('Nível médio'), tt.avgLevel.toFixed(1), '#f2f3f5'],
  ].filter(Boolean);
  let cx = 64;
  for (const [label, val, color] of chips) {
    ctx.font = `600 22px ${SANS}`; const lw = ctx.measureText(label).width;
    ctx.font = `800 30px ${FONT}`; const vw = ctx.measureText(val).width;
    const w = lw + vw + 56;
    if (cx + w > W - 64) break;
    rr(ctx, cx, 372, w, 60, 30); ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
    ctx.fillStyle = '#9a9ca6'; ctx.font = `600 22px ${SANS}`; ctx.fillText(label, cx + 22, 410);
    ctx.fillStyle = color; ctx.font = `800 30px ${FONT}`; ctx.fillText(val, cx + 34 + lw, 412);
    cx += w + 14;
  }

  // destaques
  ctx.fillStyle = '#f2f3f5'; ctx.font = `800 34px ${SANS}`;
  const kindTitle = list.some((r) => r.kind !== 'pass') ? t('Recordes do dia') : t('Melhores passes do dia');
  ctx.fillText(kindTitle, 64, 498);
  const rowH = 118;
  list.forEach((r, i) => {
    const y = 528 + i * (rowH + 12);
    rr(ctx, 64, y, W - 128, rowH, 24); ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.fill();
    // nível
    const col = MODE_COLOR[r.chart.mode] || '#f2f3f5';
    rr(ctx, 84, y + 20, 108, 78, 18); ctx.fillStyle = col; ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col; ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(`${r.chart.mode === 'HD' ? 'HD' : r.chart.mode}${r.chart.level}`, 138, y + 73);
    ctx.textAlign = 'left';
    // música e o que aconteceu
    ctx.fillStyle = '#f2f3f5'; ctx.font = `700 32px ${SANS}`;
    ctx.fillText(fit(ctx, r.chart.song.title, 470), 216, y + 54);
    let tag; let tagColor = NEON;
    if (r.kind === 'clear') tag = t('Primeiro passe');
    else if (r.kind === 'pb') tag = `+${fmtNum(r.delta)}${r.gradeUp ? ` · ${r.prevGrade} → ${r.grade}` : ''}`;
    else { tag = r.tries > 1 ? t('{n} tentativas', { n: r.tries }) : t('Passou'); tagColor = '#9a9ca6'; }
    ctx.fillStyle = tagColor; ctx.font = `700 24px ${SANS}`;
    ctx.fillText(fit(ctx, tag, 470), 216, y + 92);
    // score e grade
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f2f3f5'; ctx.font = `800 40px ${FONT}`;
    ctx.fillText(fmtNum(r.score), W - 92, y + 58);
    ctx.fillStyle = '#9a9ca6'; ctx.font = `800 28px ${FONT}`;
    ctx.fillText([r.grade, r.plate].filter(Boolean).join(' · '), W - 92, y + 94);
    ctx.textAlign = 'left';
  });
  // sobrou espaço: tentativas e passes por nível
  let y0 = 528 + list.length * (rowH + 12) + (list.length ? 56 : 100);
  const lv = rep.levels.slice(0, Math.max(0, Math.floor((H - 150 - y0 - 50) / 52)));
  if (lv.length >= 2) {
    ctx.fillStyle = '#f2f3f5'; ctx.font = `800 34px ${SANS}`;
    ctx.fillText(t('Por nível'), 64, y0 + 4);
    y0 += 34;
    lv.forEach((l, i) => {
      const y = y0 + i * 52;
      const col = MODE_COLOR[l.mode] || '#f2f3f5';
      ctx.fillStyle = col; ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`${l.mode}${l.level}`, 64, y + 32);
      const bx = 170; const bw = W - 64 - 120 - bx;
      rr(ctx, bx, y + 12, bw, 22, 11); ctx.fillStyle = 'rgba(255,120,120,.22)'; ctx.fill();
      if (l.passes) { rr(ctx, bx, y + 12, Math.max(22, bw * (l.passes / l.tries)), 22, 11); ctx.fillStyle = NEON; ctx.fill(); }
      ctx.textAlign = 'right'; ctx.fillStyle = '#f2f3f5'; ctx.font = `800 28px ${FONT}`;
      ctx.fillText(`${l.passes}/${l.tries}`, W - 64, y + 32);
      ctx.textAlign = 'left';
    });
  }
  if (!list.length) {
    ctx.fillStyle = '#9a9ca6'; ctx.font = `600 28px ${SANS}`;
    ctx.fillText(t('Nenhum passe neste dia. Bora treinar!'), 64, 560);
  }

  // rodapé
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(64, H - 104, W - 128, 2);
  ctx.fillStyle = '#9a9ca6'; ctx.font = `600 24px ${SANS}`;
  ctx.fillText(t('Gerado com PIU Stats'), 64, H - 54);
  ctx.textAlign = 'right'; ctx.fillStyle = NEON; ctx.font = `800 24px ${FONT}`;
  ctx.fillText('#PumpItUp', W - 64, H - 54);
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

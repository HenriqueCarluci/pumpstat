// Leitura das páginas do piugame.com (Phoenix 2) e phoenix.piugame.com (Phoenix).
// Funciona com qualquer Document compatível com DOM (navegador ou linkedom no servidor).
// Seletores verificados em 25/11/2026 — ver docs/SPEC.md §3.

export const GRADES = {
  sss_p: 'SSS+', sss: 'SSS', ss_p: 'SS+', ss: 'SS', s_p: 'S+', s: 'S', aaa_p: 'AAA+', aaa: 'AAA',
  aa_p: 'AA+', aa: 'AA', a_p: 'A+', a: 'A', b: 'B', c: 'C', d: 'D', f: 'F',
};

export const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
export const int = (s) => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
export const bgUrl = (el) => { const m = el && (el.getAttribute('style') || '').match(/url\(['"]?([^'")]+)/); return m ? m[1] : null; };

function imgCode(row, dir) {
  const img = [...row.querySelectorAll('img')].find((i) => (i.getAttribute('src') || '').includes('/' + dir + '/'));
  const m = img && img.getAttribute('src').match(new RegExp('/' + dir + '/([a-z_]+)\\.png'));
  return m ? m[1] : null;
}

export function kstToIso(s) {
  const m = (s || '').match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}+09:00` : null;
}

export function parseRow(row) {
  const song = text(row.querySelector('.song_name p') || row.querySelector('.song_name'));
  const ball = row.querySelector('.stepBall_in');
  if (!song || !ball) return null;
  const kind = ((bgUrl(ball) || '').match(/full\/([a-z]+)_bg/) || [])[1] || '';
  const digits = [...ball.querySelectorAll('.numw img')]
    .map((i) => ((i.getAttribute('src') || '').match(/num_(\d)\.png/) || [])[1])
    .filter(Boolean).join('');
  const level = int(digits);
  if (level == null) return null;
  const gradeCode = imgCode(row, 'grade');
  const broken = !!gradeCode && gradeCode.startsWith('x_');
  const g = broken ? gradeCode.slice(2) : gradeCode;
  const plateCode = imgCode(row, 'plate');
  const scoreEl = row.querySelector('.etc_con .num') || row.querySelector('.li_in.ac .tx') || row.querySelector('.num');
  const out = {
    song,
    mode: kind === 's' ? 'S' : kind === 'd' ? 'D' : 'C',
    level,
    broken,
    score: int(text(scoreEl)),
    grade: g ? (GRADES[g] || g.toUpperCase()) : null,
    plate: plateCode ? plateCode.toUpperCase() : null,
    jacket: bgUrl(row.querySelector('.in.bgfix')),
    date: kstToIso(text(row.querySelector('.recently_date_tt'))),
  };
  for (const k of ['PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS']) {
    const td = row.querySelector(`td[data-th="${k}"]`);
    if (td) out[k.toLowerCase()] = int(text(td));
  }
  return out;
}

export const rowsOf = (doc) => [...doc.querySelectorAll('.my_best_scoreList > li, .recently_playeList > li')];

export function lastPage(doc) {
  let max = 1;
  doc.querySelectorAll('.board_paging button').forEach((b) => {
    const m = (b.getAttribute('onclick') || '').match(/page=(\d+)/);
    if (m) max = Math.max(max, +m[1]);
  });
  return max;
}

export function parseProfile(doc) {
  const prof = doc.querySelector('.in_profile');
  let pumbility = null;
  const tot = doc.querySelector('.pumbility_total_wrap');
  if (tot) { const m = text(tot).match(/([\d,]+\.\d+|[\d,]{3,})/); if (m) pumbility = parseFloat(m[1].replace(/,/g, '')); }
  if (pumbility == null && prof) { const m = text(prof).match(/\b(\d{1,3}(,\d{3})+(\.\d+)?)\b/); if (m) pumbility = parseFloat(m[1].replace(/,/g, '')); }
  return {
    nickname: text(prof && prof.querySelector('.profile_name .t2')),
    title: text(prof && prof.querySelector('.profile_name .t1')),
    avatar_url: bgUrl(prof && prof.querySelector('.profile_img .re')),
    pumbility,
  };
}

/** Converte o que foi lido no payload aceito por ingest()/ingest_me(). */
export function toPayload(version, profile, bests, plays) {
  return {
    version,
    profile,
    bests: bests.map(({ date, perfect, great, good, bad, miss, ...b }) => ({ ...b, achieved_at: date })),
    plays: plays.filter((p) => p.date).map(({ date, ...p }) => ({ ...p, played_at: date })),
  };
}

export const isLoginPage = (doc, url) => /login\.php/.test(url || '') || !!doc.querySelector('input[type="password"]');

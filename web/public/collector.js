/* PIU Stats — coletor de scores do piugame.com (Phoenix 2) e phoenix.piugame.com (Phoenix).
 * Roda dentro da página oficial (mesma origem), lê My Best Score, Recently Played e o perfil,
 * e envia para o Supabase via RPC ingest(). Configuração vem do bookmarklet em window.__PUMPSTAT.
 */
(async function () {
  'use strict';
  const CFG = window.__PUMPSTAT || {};
  const DELAY_MS = 250;
  const GRADES = { sss_p: 'SSS+', sss: 'SSS', ss_p: 'SS+', ss: 'SS', s_p: 'S+', s: 'S', aaa_p: 'AAA+', aaa: 'AAA',
    aa_p: 'AA+', aa: 'AA', a_p: 'A+', a: 'A', b: 'B', c: 'C', d: 'D', f: 'F' };

  // ---------- UI ----------
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:auto 16px 16px auto;z-index:2147483647;width:min(360px,calc(100vw - 32px));' +
    'background:#12131a;color:#eef;border:1px solid #3b3f5c;border-radius:14px;padding:16px;font:14px/1.45 system-ui,sans-serif;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.5)';
  box.innerHTML = '<div style="font-weight:700;font-size:16px;margin-bottom:6px">PIU Stats · sincronizando</div>' +
    '<div id="ps-msg">Preparando…</div><div style="height:6px;background:#262840;border-radius:3px;margin-top:10px">' +
    '<div id="ps-bar" style="height:100%;width:0;background:linear-gradient(90deg,#ff7a2f,#ffcf3f);border-radius:3px;transition:width .2s"></div></div>';
  document.body.appendChild(box);
  const msg = (t) => { box.querySelector('#ps-msg').innerHTML = t; };
  const bar = (p) => { box.querySelector('#ps-bar').style.width = Math.round(p * 100) + '%'; };
  const fail = (t) => { msg('<span style="color:#ff8a8a">' + t + '</span>'); addClose(); };
  const addClose = () => {
    const b = document.createElement('button');
    b.textContent = 'Fechar';
    b.style.cssText = 'margin-top:12px;background:#262840;color:#eef;border:0;border-radius:8px;padding:6px 12px;cursor:pointer';
    b.onclick = () => box.remove();
    box.appendChild(b);
  };

  if (!CFG.key || !CFG.url || !CFG.anon) return fail('Bookmarklet sem configuração. Gere de novo em PIU Stats → Ajustes.');

  const host = location.hostname;

  // ---------- catálogo: no site do PIU Scores, baixa o export de charts e atualiza o banco ----------
  if (host === 'piuscores.arroweclip.se') {
    box.querySelector('div').textContent = 'PIU Stats · catálogo';
    const cols = 'ChartId,Song,Artist,StepArtist,Type,Level,SongType,BPM,NoteCount,Badges,PassDifficulty,ScoreDifficulty,ScoringLevel';
    const parseCSV = (t) => {
      const rows = []; let row = []; let f = ''; let q = false;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(f); f = ''; }
        else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
        else if (c !== '\r') f += c;
      }
      if (f || row.length) { row.push(f); rows.push(row); }
      return rows;
    };
    try {
      const done = [];
      for (const [mix, v] of [['Phoenix2', 'phoenix2'], ['Phoenix', 'phoenix']]) {
        msg('Baixando charts da ' + mix + '…');
        const rows = parseCSV(await (await fetch('/Charts/Export.csv?Mix=' + mix + '&Columns=' + cols)).text());
        if ((rows[0] || []).join(',') !== cols) throw new Error('formato do export mudou');
        const body = rows.slice(1).filter((r) => r.length >= 13);
        for (let i = 0; i < body.length; i += 600) {
          const res = await fetch(CFG.url.replace(/\/$/, '') + '/rest/v1/rpc/import_catalog', {
            method: 'POST', headers: { apikey: CFG.anon, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_key: CFG.key, p_version: v, p_rows: body.slice(i, i + 600) }),
          });
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).message) || 'HTTP ' + res.status);
          bar(Math.min(1, (i + 600) / body.length));
          msg(mix + ': ' + Math.min(body.length, i + 600) + '/' + body.length + ' charts');
        }
        done.push(mix + ': ' + body.length + ' charts');
      }
      // capas de reserva do PIU Scores para músicas que ainda não têm a imagem oficial
      msg('Procurando capas que faltam…');
      const H = { apikey: CFG.anon, 'Content-Type': 'application/json' };
      const base = CFG.url.replace(/\/$/, '');
      const missing = await (await fetch(base + '/rest/v1/songs?select=title&jacket_url=is.null&limit=2000', { headers: H })).json();
      const test = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth > 10 ? src : null); i.onerror = () => r(null); i.src = src; });
      const cands = (t) => [...new Set([t.replace(/[^A-Za-z0-9]/g, ''), t.replace(/\s+/g, ''), t.replace(/[^\p{L}\p{N}]/gu, '')])]
        .filter(Boolean).map((x) => 'https://piuimages.arroweclip.se/songs/' + encodeURIComponent(x) + '.png');
      const found = [];
      for (const m of missing) {
        for (const u of cands(m.title)) { const ok = await test(u); if (ok) { found.push([m.title, ok]); break; } }
      }
      if (found.length) {
        await fetch(base + '/rest/v1/rpc/fill_jackets', { method: 'POST', headers: H, body: JSON.stringify({ p_key: CFG.key, p_items: found }) });
      }
      done.push(found.length + ' capas novas');
      msg('<b>Catálogo atualizado.</b><br>' + done.join(' · ') +
        (CFG.app ? '<br><a href="' + CFG.app + '" style="color:#7fb4ff">Abrir o PIU Stats →</a>' : ''));
      addClose();
    } catch (e) { fail('Erro: ' + e.message); }
    return;
  }

  const version = host.startsWith('phoenix.') ? 'phoenix' : (/(^|\.)piugame\.com$/.test(host) ? 'phoenix2' : null);
  if (!version) return fail('Abra piugame.com (Phoenix 2), phoenix.piugame.com (Phoenix) ou piuscores.arroweclip.se (catálogo) e clique de novo.');

  // ---------- helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function getDoc(path) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + path);
    if (/login\.php/.test(res.url)) throw new Error('LOGIN');
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const int = (s) => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
  const bgUrl = (el) => { const m = el && (el.getAttribute('style') || '').match(/url\(['"]?([^'")]+)/); return m ? m[1] : null; };
  const imgCode = (row, dir) => {
    const img = [...row.querySelectorAll('img')].find((i) => (i.getAttribute('src') || '').includes('/' + dir + '/'));
    const m = img && img.getAttribute('src').match(new RegExp('/' + dir + '/([a-z_]+)\\.png'));
    return m ? m[1] : null;
  };
  function kstToIso(s) {
    const m = (s || '').match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
    return m ? m[1] + 'T' + m[2] + '+09:00' : null;
  }

  function parseRow(row) {
    const song = text(row.querySelector('.song_name p') || row.querySelector('.song_name'));
    const ball = row.querySelector('.stepBall_in');
    if (!song || !ball) return null;
    const kind = ((bgUrl(ball) || '').match(/full\/([a-z]+)_bg/) || [])[1] || '';
    const digits = [...ball.querySelectorAll('.numw img')]
      .map((i) => ((i.getAttribute('src') || '').match(/num_(\d)\.png/) || [])[1])
      .filter(Boolean).join('');
    const level = int(digits);
    if (level == null) return null;
    const mode = kind === 's' ? 'S' : kind === 'd' ? 'D' : 'C';
    const gradeCode = imgCode(row, 'grade');
    const plateCode = imgCode(row, 'plate');
    const scoreEl = row.querySelector('.etc_con .num') || row.querySelector('.li_in.ac .tx') || row.querySelector('.num');
    // "x_f", "x_a"… = grade quebrado (stage break)
    const broken = !!gradeCode && gradeCode.startsWith('x_');
    const g = broken ? gradeCode.slice(2) : gradeCode;
    const out = {
      song, mode, level, broken,
      score: int(text(scoreEl)),
      grade: g ? (GRADES[g] || g.toUpperCase()) : null,
      plate: plateCode ? plateCode.toUpperCase() : null,
      jacket: bgUrl(row.querySelector('.in.bgfix')),
    };
    const date = kstToIso(text(row.querySelector('.recently_date_tt')));
    const judg = {};
    for (const k of ['PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS']) {
      const td = row.querySelector('td[data-th="' + k + '"]');
      if (td) judg[k.toLowerCase()] = int(text(td));
    }
    return { ...out, date, ...judg };
  }
  const rowsOf = (doc) => [...doc.querySelectorAll('.my_best_scoreList > li, .recently_playeList > li')];
  const lastPage = (doc) => {
    let max = 1;
    doc.querySelectorAll('.board_paging button').forEach((b) => {
      const m = (b.getAttribute('onclick') || '').match(/page=(\d+)/);
      if (m) max = Math.max(max, +m[1]);
    });
    return max;
  };

  // ---------- modo "capas": varre o ranking Over Lv.20 e grava a imagem de cada música ----------
  if (CFG.mode === 'jackets') {
    try {
      const map = new Map();
      const take = (doc) => doc.querySelectorAll('a[href*="over_ranking_view"]').forEach((a) => {
        const t = text(a.querySelector('.songName_w .tt'));
        const u = bgUrl(a.querySelector('.songImg_w .re'));
        if (t && u && !map.has(t)) map.set(t, u);
      });
      box.querySelector('div').textContent = 'PIU Stats · capas';
      const first = await getDoc('/leaderboard/over_ranking.php');
      take(first);
      const pages = lastPage(first);
      let next = 2; let done = 1;
      const worker = async () => {
        while (next <= pages) {
          const n = next++;
          take(await getDoc('/leaderboard/over_ranking.php?&&page=' + n));
          done++;
          bar(done / pages);
          msg('Página ' + done + ' de ' + pages + ' · ' + map.size + ' capas');
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      msg('Enviando ' + map.size + ' capas…');
      const res = await fetch(CFG.url.replace(/\/$/, '') + '/rest/v1/rpc/set_jackets', {
        method: 'POST',
        headers: { apikey: CFG.anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: CFG.key, p_items: [...map.entries()] }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || ('Supabase HTTP ' + res.status));
      bar(1);
      msg('<b>Capas atualizadas.</b><br>' + out.updated + ' músicas receberam capa · ' + out.without_jacket + ' ainda sem capa' +
        (CFG.app ? '<br><a href="' + CFG.app + '" style="color:#7fb4ff">Abrir o PIU Stats →</a>' : ''));
      addClose();
    } catch (e) {
      fail(e.message === 'LOGIN' ? 'Faça login no site e clique de novo.' : 'Erro: ' + e.message);
    }
    return;
  }

  try {
    // ---------- perfil ----------
    msg('Lendo perfil…');
    const pb = await getDoc('/my_page/pumbility.php');
    const prof = pb.querySelector('.in_profile') || document.querySelector('.in_profile');
    let pumbility = null;
    const tot = pb.querySelector('.pumbility_total_wrap');
    if (tot) { const m = text(tot).match(/([\d,]+\.\d+|[\d,]{3,})/); if (m) pumbility = parseFloat(m[1].replace(/,/g, '')); }
    if (pumbility == null && prof) { const m = text(prof).match(/\b(\d{1,3}(,\d{3})+(\.\d+)?)\b/); if (m) pumbility = parseFloat(m[1].replace(/,/g, '')); }
    const profile = {
      nickname: text(prof && prof.querySelector('.profile_name .t2')),
      title: text(prof && prof.querySelector('.profile_name .t1')),
      avatar_url: bgUrl(prof && prof.querySelector('.profile_img .re')),
      pumbility,
    };

    // ---------- melhores scores ----------
    const first = await getDoc('/my_page/my_best_score.php');
    const pages = lastPage(first);
    const bests = [];
    const add = (doc) => rowsOf(doc).forEach((r) => { const p = parseRow(r); if (p) bests.push(p); });
    add(first);
    // 3 páginas em paralelo, com pausa curta entre requisições de cada "trabalhador"
    let nextPage = 2; let read = 1;
    const worker = async () => {
      while (nextPage <= pages) {
        const n = nextPage++;
        await sleep(DELAY_MS);
        add(await getDoc('/my_page/my_best_score.php?&&page=' + n));
        read++;
        bar(read / (pages + 2));
        msg('Melhores scores: ' + read + ' de ' + pages + ' páginas…');
      }
    };
    await Promise.all([worker(), worker(), worker()]);

    // ---------- jogadas recentes ----------
    msg('Lendo jogadas recentes…');
    const rp = await getDoc('/my_page/recently_played.php');
    const plays = rowsOf(rp).map(parseRow).filter((p) => p && p.date);
    bar((pages + 1) / (pages + 2));

    // ---------- envio ----------
    msg('Enviando ' + bests.length + ' recordes e ' + plays.length + ' jogadas…');
    const payload = {
      version,
      profile,
      bests: bests.map(({ date, perfect, great, good, bad, miss, ...b }) => ({ ...b, achieved_at: date })),
      plays: plays.map(({ date, ...p }) => ({ ...p, played_at: date })),
    };
    const res = await fetch(CFG.url.replace(/\/$/, '') + '/rest/v1/rpc/ingest', {
      method: 'POST',
      headers: { apikey: CFG.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: CFG.key, p_payload: payload }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.message || ('Supabase HTTP ' + res.status));
    bar(1);
    const vname = version === 'phoenix' ? 'Phoenix' : 'Phoenix 2';
    let html = '<b>' + vname + ' sincronizada.</b><br>' + bests.length + ' recordes lidos · ' + out.new_bests +
      ' novos/melhorados<br>' + plays.length + ' jogadas recentes · ' + out.new_plays + ' novas';
    if (out.unmatched && out.unmatched.length) {
      html += '<br><span style="color:#ffcf3f">' + out.unmatched.length + ' charts fora do catálogo (criados automaticamente).</span>';
    }
    if (CFG.app) html += '<br><a href="' + CFG.app + '" style="color:#7fb4ff">Abrir o PIU Stats →</a>';
    msg(html);
    addClose();
  } catch (e) {
    if (e.message === 'LOGIN') fail('Você não está logado neste site. Faça login e clique no favorito de novo.');
    else fail('Erro: ' + e.message);
    console.error('[PIU Stats]', e);
  }
})();

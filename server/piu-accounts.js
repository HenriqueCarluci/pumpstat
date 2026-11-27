// Contas AM.PASS com mais de um ID de jogo: o piugame mostra a janela "Switch Account" em /my_page/play_data.php,
// com um cartão por ID (título, nick, último acesso). Aqui lemos os cartões e repetimos o clique no cartão escolhido.
// O site não documenta o clique; tentamos, nesta ordem: link do cartão, formulário, e a função do onclick
// (procurando a URL dela nos scripts da página). Depois conferimos se o nick do perfil virou o escolhido.

const NICK_RE = /[^\s#<>]{1,24}\s*#\s*\d{3,5}/;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const normNick = (s) => clean(s).replace(/\s*#\s*/, ' #').toUpperCase();

/** Bloco da janela "Switch Account" (ou null quando a conta tem um ID só). */
export function switchModal(doc) {
  const heads = [...doc.querySelectorAll('h1,h2,h3,h4,h5,strong,p,div,span')]
    .filter((e) => /^switch account$/i.test(clean(e.textContent)));
  for (const h of heads) {
    let box = h.parentElement;
    for (let i = 0; box && i < 6; i++, box = box.parentElement) {
      const n = new Set(((box.textContent || '').match(new RegExp(NICK_RE.source, 'g')) || []).map(normNick)).size;
      if (n >= 2 && (box.textContent || '').length < 20_000) return box;
    }
  }
  return null;
}

/** Cartões da janela: menor elemento que contém exatamente um nick. */
export function parseAccounts(doc) {
  const modal = switchModal(doc);
  if (!modal) return { modal: null, accounts: [] };
  const cards = [];
  const walk = (el) => {
    const nicks = (el.textContent || '').match(new RegExp(NICK_RE.source, 'g')) || [];
    if (!nicks.length) return;
    const kids = [...el.children].filter((k) => NICK_RE.test(k.textContent || ''));
    const oneEach = kids.length > 1 && kids.every((k) => ((k.textContent || '').match(new RegExp(NICK_RE.source, 'g')) || []).length === 1);
    if (oneEach) { kids.forEach((k) => cards.push(k)); return; }
    if (kids.length === 1 && nicks.length > 1) return walk(kids[0]);
    if (nicks.length === 1 && !cards.includes(el)) { cards.push(el); return; }
    kids.forEach(walk);
  };
  walk(modal);
  const accounts = cards.map((c, i) => {
    const lines = [...c.querySelectorAll('*')].filter((e) => !e.children.length).map((e) => clean(e.textContent)).filter(Boolean);
    const exact = lines.find((l) => new RegExp(`^${NICK_RE.source}$`).test(l));
    const nickname = normNick(exact || (lines.join(' ').match(NICK_RE) || [''])[0]);
    const title = lines.find((l) => l !== nickname && !NICK_RE.test(l) && !/access/i.test(l)) || '';
    const img = c.querySelector('img');
    const bg = [...c.querySelectorAll('[style*="url("]')].map((e) => (e.getAttribute('style').match(/url\(['"]?([^'")]+)/) || [])[1]).find(Boolean);
    const cls = `${c.getAttribute('class') || ''} ${[...c.querySelectorAll('[class]')].map((e) => e.getAttribute('class')).join(' ')}`;
    const current = /\b(on|active|current|selected|check(ed)?|now)\b/i.test(cls) || !!c.querySelector('[class*="check"], .fa-check, .xi-check, svg');
    return { i, nickname, title, avatar: (img && img.getAttribute('src')) || bg || null, current, el: c };
  }).filter((a) => a.nickname);
  // se mais de um parecer "atual", não dá para saber pelo HTML
  if (accounts.filter((a) => a.current).length !== 1) accounts.forEach((a) => { a.current = false; });
  return { modal, accounts };
}

/** O que o clique no cartão faz: link, formulário ou função do onclick com os argumentos. */
export function cardAction(card) {
  const near = [card.el, ...card.el.querySelectorAll('*')];
  let up = card.el.parentElement;
  for (let i = 0; up && i < 2; i++, up = up.parentElement) near.push(up);
  for (const e of near) {
    const href = e.getAttribute && e.getAttribute('href');
    if (href && !/^(#|javascript:)/i.test(href.trim())) return { kind: 'href', href };
  }
  for (const e of near) {
    const form = e.closest && e.closest('form');
    if (form) {
      const fields = {};
      for (const inp of form.querySelectorAll('input[name], select[name], textarea[name]')) {
        if (/^(checkbox|radio)$/i.test(inp.getAttribute('type') || '') && !inp.hasAttribute('checked')) continue;
        fields[inp.getAttribute('name')] = inp.getAttribute('value') || '';
      }
      const btn = card.el.querySelector('button[name], input[type=submit][name]') || (card.el.matches('button[name]') ? card.el : null);
      if (btn) fields[btn.getAttribute('name')] = btn.getAttribute('value') || '';
      return { kind: 'form', action: form.getAttribute('action') || '', method: (form.getAttribute('method') || 'GET').toUpperCase(), fields };
    }
  }
  for (const e of near) {
    const on = (e.getAttribute && (e.getAttribute('onclick') || (/^javascript:/i.test(e.getAttribute('href') || '') ? e.getAttribute('href').replace(/^javascript:/i, '') : ''))) || '';
    const m = on.match(/([A-Za-z_$][\w$.]*)\s*\(([^)]*)\)/);
    if (m) return { kind: 'call', fn: m[1].split('.').pop(), args: splitArgs(m[2]) };
  }
  const data = {};
  for (const e of near) for (const a of (e.attributes ? [...e.attributes] : [])) if (/^data-/.test(a.name)) data[a.name.slice(5)] = a.value;
  if (Object.keys(data).length) return { kind: 'data', data };
  return null;
}

function splitArgs(s) {
  const out = []; let cur = ''; let q = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Acha a função do onclick nos scripts da página e monta a requisição (URL e campos) com os argumentos do cartão. */
export function requestFromScript(scripts, fn, args, extraData = {}) {
  for (const src of scripts) {
    const re = new RegExp(`function\\s+${fn}\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
    const m = src.match(re) || src.match(new RegExp(`${fn}\\s*=\\s*function\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm'));
    if (!m) continue;
    const params = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    const val = (name) => { const k = params.indexOf(name); return k >= 0 ? args[k] : undefined; };
    const body = m[2];
    // location.href = '/x.php?id=' + id
    const loc = body.match(/location(?:\.href)?\s*=\s*([^;\n]+)/) || body.match(/location\.(?:replace|assign)\(\s*([^)]+)\)/);
    if (loc) return { method: 'GET', url: concatExpr(loc[1], val), fields: null };
    const url = (body.match(/url\s*:\s*(['"])([^'"]+)\1/) || body.match(/\$\.(?:post|get|ajax)\(\s*(['"])([^'"]+)\1/) || body.match(/fetch\(\s*(['"])([^'"]+)\1/) || [])[2];
    if (!url) continue;
    const method = /\$\.get\(/.test(body) || /type\s*:\s*['"]get['"]/i.test(body) ? 'GET' : 'POST';
    const fields = {};
    const dataObj = body.match(/data\s*:\s*\{([^}]*)\}/) || body.match(/\$\.(?:post|get)\([^,]+,\s*\{([^}]*)\}/);
    if (dataObj) {
      for (const pair of dataObj[1].split(',')) {
        const [k, v] = pair.split(':').map((x) => (x || '').trim());
        if (!k) continue;
        const key = k.replace(/['"]/g, '');
        const lit = (v || '').match(/^(['"])(.*)\1$/);
        fields[key] = lit ? lit[2] : (val(v) ?? extraData[v] ?? '');
      }
    } else params.forEach((p, k) => { fields[p] = args[k]; });
    return { method, url, fields };
  }
  return null;
}

function concatExpr(expr, val) {
  return expr.split('+').map((p) => {
    const t = p.trim();
    const lit = t.match(/^(['"])(.*)\1$/);
    if (lit) return lit[2];
    return val(t) ?? '';
  }).join('');
}

/**
 * Troca para a conta com esse nick. Devolve o nick que ficou ativo (ou lança erro se não conseguir).
 * session: PiuSession; getDoc(path) -> { doc, html }.
 */
export async function switchTo(session, getDoc, nickname) {
  const want = normNick(nickname);
  const { doc, html } = await getDoc('/my_page/play_data.php');
  const { accounts } = parseAccounts(doc);
  const card = accounts.find((a) => a.nickname === want);
  if (!card) return null; // esse ID não existe nesta versão; segue com a conta atual
  if (card.current) return want;
  const act = cardAction(card);
  if (!act) throw Object.assign(new Error(), { code: 'switch_unknown' });
  if (act.kind === 'href') await session.get(act.href);
  else if (act.kind === 'form') {
    if (act.method === 'POST') await session.request(act.action || '/my_page/play_data.php', { method: 'POST', form: act.fields });
    else await session.get(`${act.action || '/my_page/play_data.php'}?${new URLSearchParams(act.fields)}`);
  } else if (act.kind === 'call') {
    const scripts = [...doc.querySelectorAll('script')].map((s) => s.textContent || '');
    let req = requestFromScript(scripts, act.fn, act.args);
    if (!req) {
      // a função pode estar num .js do próprio site
      for (const s of doc.querySelectorAll('script[src]')) {
        const src = s.getAttribute('src');
        if (!/^\/|piugame\.com/.test(src) || /jquery|swiper|slick|gtag|analytics/i.test(src)) continue;
        try { const r = await session.get(src); req = requestFromScript([r.html], act.fn, act.args); } catch { /* ignora */ }
        if (req) break;
      }
    }
    if (!req) throw Object.assign(new Error(), { code: 'switch_unknown' });
    if (req.method === 'GET') await session.get(req.fields ? `${req.url}${req.url.includes('?') ? '&' : '?'}${new URLSearchParams(req.fields)}` : req.url);
    else await session.request(req.url, { method: 'POST', form: req.fields || {}, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  } else throw Object.assign(new Error(), { code: 'switch_unknown' });
  void html;
  return want;
}

export { normNick };

// Atualiza o catálogo (músicas e charts) a partir do export público do PIU Scores.
// Músicas novas criadas aqui viram notificação de "música nova" no app.
const COLS = 'ChartId,Song,Artist,StepArtist,Type,Level,SongType,BPM,NoteCount,Badges,PassDifficulty,ScoreDifficulty,ScoringLevel';
const MIXES = [['Phoenix2', 'phoenix2'], ['Phoenix', 'phoenix']];

function parseCSV(t) {
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
}

export async function refreshCatalog({ supabaseUrl, supabaseKey, ingestKey, log = console.log }) {
  const H = { apikey: supabaseKey, 'Content-Type': 'application/json' };
  // só roda se a última atualização tiver mais de 20 h (a função registra o horário)
  const gate = await fetch(`${supabaseUrl}/rest/v1/rpc/catalog_refresh_due`, { method: 'POST', headers: H, body: JSON.stringify({ p_key: ingestKey }) });
  if (!gate.ok || !(await gate.json())) return { skipped: true };
  const out = {};
  for (const [mix, version] of MIXES) {
    const res = await fetch(`https://piuscores.arroweclip.se/Charts/Export.csv?Mix=${mix}&Columns=${COLS}`);
    if (!res.ok) throw new Error(`PIU Scores ${mix}: HTTP ${res.status}`);
    const rows = parseCSV(await res.text());
    if ((rows[0] || []).join(',') !== COLS) throw new Error('formato do export do PIU Scores mudou');
    const body = rows.slice(1).filter((r) => r.length >= 13);
    for (let i = 0; i < body.length; i += 600) {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/import_catalog`, {
        method: 'POST', headers: H, body: JSON.stringify({ p_key: ingestKey, p_version: version, p_rows: body.slice(i, i + 600) }),
      });
      if (!r.ok) throw new Error(`import_catalog: ${(await r.text()).slice(0, 200)}`);
    }
    out[version] = body.length;
  }
  log('catálogo atualizado', out);
  return out;
}

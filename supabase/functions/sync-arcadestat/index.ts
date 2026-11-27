// Sincroniza as barrinhas de skill (topTag) do ArcadeStat para chart_tags_ref.
// Fonte: comunidade ArcadeStat (arcadestat.app) - crédito na tela de Configurações.
// Uma chamada por execução, no máximo uma vez a cada 6 horas.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SRC = 'https://arcadestat.app/pump/song/all';

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: last } = await db.from('arcadestat_sync').select('ran_at').order('ran_at', { ascending: false }).limit(1);
  if (last?.[0] && Date.now() - new Date(last[0].ran_at).getTime() < 6 * 3600 * 1000) {
    return Response.json({ skipped: true, last: last[0].ran_at });
  }
  const r = await fetch(SRC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'PIU-Stats-sync/1.0' },
    body: JSON.stringify({ date: '2024-01-01', versionId: 8 }),
  });
  if (!r.ok) return Response.json({ error: `arcadestat ${r.status}` }, { status: 502 });
  const j = await r.json();
  const list: any[] = j.list ?? Object.values(j.map ?? {}).flat();
  const rows = list
    .filter((x) => !x.deleted && x.topTag?.n?.length)
    .map((x) => ({
      t: x.titleEn || x.title,
      h: (String(x.imageUrl || '').match(/([0-9a-f]{32})\.png/) || [])[1] || '',
      d: x.difficulty,
      n: x.topTag.n,
      v: x.topTag.v,
    }));
  const { data, error } = await db.rpc('import_arcadestat', { p: rows });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
});

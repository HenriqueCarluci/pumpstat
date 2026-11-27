-- 063: barrinhas de skill do ArcadeStat (topTag: as 5 tags com mais votos de cada chart e o peso de cada uma).
-- Fonte: comunidade ArcadeStat (arcadestat.app). A licença deles pede atribuição; o app mostra o crédito.
-- score = % relativo à tag mais forte do chart (100 = a mais votada). Tags sem score vieram só do filtro manual.
alter table public.chart_tags_ref add column if not exists score smallint check (score between 0 and 100);

create table if not exists public.arcadestat_sync (
  id         bigint generated always as identity primary key,
  ran_at     timestamptz not null default now(),
  rows_in    int,
  matched    int,
  unmatched  jsonb
);
alter table public.arcadestat_sync enable row level security;
revoke all on public.arcadestat_sync from anon, authenticated;

-- p: [{"t": título em inglês, "h": hash da imagem do piugame, "d": "S20", "n": [ids], "v": [pesos]}, ...]
-- ids na ordem do ArcadeStat (igual a CHART_TAGS em web/src/lib/tags.js).
create or replace function public.import_arcadestat(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tags constant text[] := array['drill','gimmick','twist','bracket','side','run','stamina','half','crossover','mash',
    'high_twist','horizontal_twist','hold','no_bar','fast','slow','cheat','jack','beat3','stair','switch','jump',
    'leg_split','beat12','beat24','beat32','double_stairs','gallop','micro_desync','spin'];
  v_matched int; v_un jsonb;
begin
  create temp table _in on commit drop as
    select x.ord, x.e->>'t' t, x.e->>'h' h, left(x.e->>'d', 1) m, substr(x.e->>'d', 2)::int l, x.e->'n' n, x.e->'v' v
      from jsonb_array_elements(p) with ordinality x(e, ord)
     where x.e->>'d' ~ '^[SDC][0-9]+$';

  create temp table _m on commit drop as
    select distinct on (i.ord, c.id) i.ord, c.id chart_id, i.n, i.v
      from _in i
      join songs s on s.title_key = title_key(i.t)
                   or (i.h is not null and i.h <> '' and s.jacket_url like '%' || i.h || '%')
      join charts c on c.song_id = s.id and c.mode = i.m and c.level = i.l and c.version in ('phoenix2', 'phoenix');

  -- pesos antigos saem (o topTag muda com os votos); tags manuais sem peso ficam
  update chart_tags_ref set score = null where source = 'arcadestat' and score is not null;

  insert into chart_tags_ref (chart_id, tag, score, source, updated_at)
  select m.chart_id, tags[(m.n->>k.i)::int + 1],
         round(100.0 * (m.v->>k.i)::numeric / nullif((select max(x::numeric) from jsonb_array_elements_text(m.v) x), 0))::smallint,
         'arcadestat', now()
    from _m m, generate_series(0, jsonb_array_length(m.n) - 1) k(i)
   where (m.v->>k.i)::numeric > 0 and (m.n->>k.i)::int between 0 and 29
  on conflict (chart_id, tag) do update set score = excluded.score, updated_at = now();

  select count(distinct ord) into v_matched from _m;
  select coalesce(jsonb_agg(i.t || ' ' || i.m || i.l), '[]') into v_un
    from _in i where not exists (select 1 from _m where _m.ord = i.ord);
  insert into arcadestat_sync (rows_in, matched, unmatched) values ((select count(*) from _in), v_matched, v_un);
  return jsonb_build_object('rows', (select count(*) from _in), 'matched', v_matched, 'unmatched', jsonb_array_length(v_un));
end $$;
revoke all on function public.import_arcadestat(jsonb) from public, anon, authenticated;

-- [[chart_id, [tags], {tag: score}]] da versão (o 3º item é novo; clientes antigos ignoram)
create or replace function public.chart_ref_tags(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.tags, x.scores)), '[]'::jsonb)
    from (select t.chart_id, jsonb_agg(t.tag order by t.tag) tags,
                 coalesce(jsonb_object_agg(t.tag, t.score) filter (where t.score is not null), '{}'::jsonb) scores
            from chart_tags_ref t join charts c on c.id = t.chart_id and c.version = p_version
           group by t.chart_id) x
$$;
revoke all on function public.chart_ref_tags(text) from public;
grant execute on function public.chart_ref_tags(text) to anon, authenticated;

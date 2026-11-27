-- 065: import_arcadestat mais rápido (cruza por título e hash da capa com índices; o OR com LIKE estourava o timeout)
create or replace function public.import_arcadestat(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tags constant text[] := array['drill','gimmick','twist','bracket','side','run','stamina','half','crossover','mash',
    'high_twist','horizontal_twist','hold','no_bar','fast','slow','cheat','jack','beat3','stair','switch','jump',
    'leg_split','beat12','beat24','beat32','double_stairs','gallop','micro_desync','spin'];
  v_matched int; v_un jsonb;
begin
  create temp table _in on commit drop as
    select x.ord, x.e->>'t' t, title_key(x.e->>'t') k, nullif(x.e->>'h', '') h,
           left(x.e->>'d', 1) m, substr(x.e->>'d', 2)::int l, x.e->'n' n, x.e->'v' v
      from jsonb_array_elements(p) with ordinality x(e, ord)
     where x.e->>'d' ~ '^[SDC][0-9]+$';

  create temp table _s on commit drop as
    select id, title_key k, substring(jacket_url from '([0-9a-f]{32})\.png') h from songs;
  create index on _s (k); create index on _s (h);

  create temp table _sm on commit drop as
    select i.ord, s.id song_id from _in i join _s s on s.k = i.k;
  insert into _sm
    select i.ord, s.id from _in i join _s s on s.h = i.h
     where i.h is not null and not exists (select 1 from _sm x where x.ord = i.ord);

  create temp table _m on commit drop as
    select distinct i.ord, c.id chart_id, i.n, i.v
      from _sm sm join _in i on i.ord = sm.ord
      join charts c on c.song_id = sm.song_id and c.mode = i.m and c.level = i.l and c.version in ('phoenix2', 'phoenix');

  update chart_tags_ref set score = null where source = 'arcadestat' and score is not null;

  insert into chart_tags_ref (chart_id, tag, score, source, updated_at)
  select distinct on (m.chart_id, tags[(m.n->>k.i)::int + 1]) m.chart_id, tags[(m.n->>k.i)::int + 1],
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

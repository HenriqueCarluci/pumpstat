-- 068: ajuste manual das tags de um chart pela equipe (curadoria/admin). Fica por cima da base do ArcadeStat
-- e sobrevive às sincronizações: score = peso forçado (0–100); score nulo = tag escondida.
create table if not exists public.chart_tag_overrides (
  chart_id   bigint not null references public.charts (id) on delete cascade,
  tag        text not null check (tag ~ '^[a-z0-9_]+$'),
  score      smallint check (score between 1 and 100),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (chart_id, tag)
);
alter table public.chart_tag_overrides enable row level security;
revoke all on public.chart_tag_overrides from anon, authenticated;

-- tags finais de um chart: base do ArcadeStat com os ajustes da equipe por cima
create or replace function public.chart_tags_final(p_chart bigint)
returns table (tag text, score smallint, edited boolean) language sql stable security definer set search_path = public as $$
  select b.tag, b.score, false from chart_tags_ref b
   where b.chart_id = p_chart and not exists (select 1 from chart_tag_overrides o where o.chart_id = b.chart_id and o.tag = b.tag)
  union all
  select o.tag, o.score, true from chart_tag_overrides o where o.chart_id = p_chart and o.score is not null
$$;

-- [[chart_id, [tags], {tag: score}, editado?]] da versão
create or replace function public.chart_ref_tags(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select b.chart_id, b.tag, b.score, false edited from chart_tags_ref b join charts c on c.id = b.chart_id and c.version = p_version
     where not exists (select 1 from chart_tag_overrides o where o.chart_id = b.chart_id and o.tag = b.tag)
    union all
    select o.chart_id, o.tag, o.score, true from chart_tag_overrides o join charts c on c.id = o.chart_id and c.version = p_version
     where o.score is not null)
  select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.tags, x.scores, x.edited)), '[]'::jsonb)
    from (select chart_id, jsonb_agg(tag order by tag) tags,
                 coalesce(jsonb_object_agg(tag, score) filter (where score is not null), '{}'::jsonb) scores,
                 bool_or(edited) or exists (select 1 from chart_tag_overrides o where o.chart_id = m.chart_id) edited
            from m group by chart_id) x
$$;
revoke all on function public.chart_ref_tags(text) from public;
grant execute on function public.chart_ref_tags(text) to anon, authenticated;

-- a equipe define as tags do chart: p_tags = {"run": 100, "twist": 80, ...} (o estado final que deve aparecer)
-- grava só a diferença para a base do ArcadeStat; p_tags nulo volta para a base (apaga os ajustes)
create or replace function public.admin_set_chart_tags(p_chart bigint, p_tags jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  allowed constant text[] := array['drill','gimmick','twist','bracket','side','run','stamina','half','crossover','mash',
    'high_twist','horizontal_twist','hold','no_bar','fast','slow','cheat','jack','beat3','stair','switch','jump',
    'leg_split','beat12','beat24','beat32','double_stairs','gallop','micro_desync','spin'];
  k text; v int;
begin
  perform admin_guard('charts');
  if not exists (select 1 from charts where id = p_chart) then raise exception 'chart não encontrado'; end if;
  delete from chart_tag_overrides where chart_id = p_chart;
  if p_tags is not null then
    if jsonb_typeof(p_tags) <> 'object' then raise exception 'tags inválidas'; end if;
    for k, v in select key, round(value::text::numeric)::int from jsonb_each(p_tags) loop
      if not (k = any(allowed)) then raise exception 'tag desconhecida: %', k; end if;
      v := greatest(1, least(100, v));
      if v is distinct from (select score from chart_tags_ref where chart_id = p_chart and tag = k) then
        insert into chart_tag_overrides (chart_id, tag, score, updated_by) values (p_chart, k, v, auth.uid());
      end if;
    end loop;
    -- tags da base que a equipe tirou
    insert into chart_tag_overrides (chart_id, tag, score, updated_by)
    select p_chart, b.tag, null, auth.uid() from chart_tags_ref b
     where b.chart_id = p_chart and not (p_tags ? b.tag);
  end if;
  return (select coalesce(jsonb_object_agg(tag, score), '{}'::jsonb) from chart_tags_final(p_chart));
end $$;
revoke all on function public.admin_set_chart_tags(bigint, jsonb) from public, anon;
grant execute on function public.admin_set_chart_tags(bigint, jsonb) to authenticated;

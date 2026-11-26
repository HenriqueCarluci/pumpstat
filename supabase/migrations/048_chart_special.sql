-- 048: charts especiais — gimmick (por tipo) e steps fora da curva.
-- Fonte: marcação do admin (chart_flags) + votos da comunidade nas avaliações (quem passou o chart).
-- Um tipo entra pela comunidade com N votos (app_config.community.special_min, padrão 2).
create table if not exists public.chart_flags (
  chart_id   bigint primary key references public.charts(id) on delete cascade,
  gimmicks   text[] not null default '{}',
  special    boolean not null default false,          -- steps muito diferentes / fora da curva
  note       text check (char_length(note) <= 200),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.chart_flags enable row level security;
revoke all on public.chart_flags from anon, authenticated;

create or replace function public.admin_set_chart_flags(p_chart bigint, p_gimmicks text[], p_special boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  perform admin_guard();
  select coalesce(array_agg(distinct g), '{}') into v from unnest(coalesce(p_gimmicks, '{}')) g
   where g in ('speed', 'stop', 'fake', 'warp', 'visual', 'other');
  if cardinality(v) = 0 and not coalesce(p_special, false) and nullif(trim(coalesce(p_note, '')), '') is null then
    delete from chart_flags where chart_id = p_chart;
    return jsonb_build_object('deleted', true);
  end if;
  insert into chart_flags (chart_id, gimmicks, special, note, updated_by)
  values (p_chart, v, coalesce(p_special, false), left(nullif(trim(coalesce(p_note, '')), ''), 200), auth.uid())
  on conflict (chart_id) do update set gimmicks = excluded.gimmicks, special = excluded.special, note = excluded.note,
    updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('saved', true);
end $$;
revoke all on function public.admin_set_chart_flags(bigint, text[], boolean, text) from public, anon;
grant execute on function public.admin_set_chart_flags(bigint, text[], boolean, text) to authenticated;

-- avaliação: novas tags de gimmick por tipo e "fora da curva"
create or replace function public.review_chart(p_chart bigint, p_tier smallint, p_tags text[], p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_tags text[]; v_comment text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not exists (select 1 from user_scores s where s.user_id = me and s.chart_id = p_chart and not coalesce(s.broken, false)) then
    raise exception 'só quem já passou este chart pode avaliar (sincronize suas notas)';
  end if;
  select coalesce(array_agg(distinct t), '{}') into v_tags
    from unnest(coalesce(p_tags, '{}')) t
   where t in ('twist', 'drill', 'run', 'bracket', 'jump', 'jack', 'doublestep', 'footswitch', 'gimmick', 'stamina', 'hold', 'tecnico',
               'g_speed', 'g_stop', 'g_fake', 'g_warp', 'g_visual', 'offcurve');
  -- marcar um tipo de gimmick já conta como gimmick
  if v_tags && array['g_speed', 'g_stop', 'g_fake', 'g_warp', 'g_visual'] and not ('gimmick' = any(v_tags)) then
    v_tags := v_tags || 'gimmick'::text;
  end if;
  v_comment := nullif(trim(coalesce(p_comment, '')), '');
  if p_tier is null and cardinality(v_tags) = 0 and v_comment is null then
    delete from chart_reviews where user_id = me and chart_id = p_chart;
    return jsonb_build_object('deleted', true);
  end if;
  insert into chart_reviews (user_id, chart_id, tier, tags, comment)
  values (me, p_chart, p_tier, v_tags, left(v_comment, 500))
  on conflict (user_id, chart_id) do update set tier = excluded.tier, tags = excluded.tags,
    comment = excluded.comment, updated_at = now();
  return jsonb_build_object('saved', true);
end $$;

-- dados da comunidade por chart: média do tier, votos, tags mais marcadas, tier do clube e o "especial"
create or replace function public.community_charts(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  with cfg as (select greatest(1, coalesce((app_config()->'community'->>'special_min')::int, 2)) as n),
  votes as (
    select r.chart_id, t, count(*) n from chart_reviews r join charts c on c.id = r.chart_id and c.version = p_version,
           unnest(r.tags) t
     where t in ('gimmick', 'g_speed', 'g_stop', 'g_fake', 'g_warp', 'g_visual', 'offcurve')
     group by 1, 2
  ),
  spec as (
    select c.id as chart_id,
           f.gimmicks as admin_g, coalesce(f.special, false) as admin_off, f.note,
           coalesce((select array_agg(substr(v.t, 3) order by v.n desc) from votes v, cfg
                      where v.chart_id = c.id and v.t like 'g\_%' and v.n >= cfg.n), '{}') as comm_g,
           exists (select 1 from votes v, cfg where v.chart_id = c.id and v.t = 'gimmick' and v.n >= cfg.n) as comm_gim,
           exists (select 1 from votes v, cfg where v.chart_id = c.id and v.t = 'offcurve' and v.n >= cfg.n) as comm_off
      from charts c left join chart_flags f on f.chart_id = c.id
     where c.version = p_version
       and (f.chart_id is not null or exists (select 1 from votes v where v.chart_id = c.id))
  )
  select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.avg, x.votes, x.tags, o.tier, sp.obj)), '[]')
    from (
      select c.id as chart_id,
             (select round(avg(r.tier)::numeric, 2) from chart_reviews r where r.chart_id = c.id) avg,
             (select count(r.tier) from chart_reviews r where r.chart_id = c.id) votes,
             (select coalesce(jsonb_agg(t order by n desc), '[]') from
                (select t, count(*) n from chart_reviews r2, unnest(r2.tags) t where r2.chart_id = c.id
                  group by t order by n desc limit 3) z) tags
        from charts c
       where c.version = p_version
         and (exists (select 1 from chart_reviews r where r.chart_id = c.id)
              or exists (select 1 from chart_tier_overrides o2 where o2.chart_id = c.id)
              or exists (select 1 from chart_flags f2 where f2.chart_id = c.id))
    ) x
    left join chart_tier_overrides o on o.chart_id = x.chart_id
    left join lateral (
      select jsonb_build_object(
               'g', case when cardinality(coalesce(s.admin_g, '{}')) > 0 then to_jsonb(s.admin_g) else to_jsonb(s.comm_g) end,
               'gimmick', cardinality(coalesce(s.admin_g, '{}')) > 0 or cardinality(s.comm_g) > 0 or s.comm_gim,
               'off', s.admin_off or s.comm_off,
               'note', s.note,
               'admin', s.admin_g is not null) as obj
        from spec s where s.chart_id = x.chart_id
    ) sp on true
   where auth.uid() is not null
$$;

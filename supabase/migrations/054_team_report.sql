-- 054: relatório do time (Meu Time): dia, semana ou mês, com navegação para períodos anteriores.
-- Totais do período e do período anterior (evolução), atividade ao longo do período (passes x quebras),
-- músicas mais jogadas pelo time e números por participante (só contagens, nunca as notas).
create or replace function public.team_report(p_version text default 'phoenix2', p_period text default 'week', p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid(); tz text := 'America/Sao_Paulo'; v_team bigint;
  ln timestamp := now() at time zone tz; ls timestamp; le timestamp; lps timestamp;
  s timestamptz; e timestamptz; ps timestamptz; unit interval; off int := greatest(0, least(coalesce(p_offset, 0), 120));
  out jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select team_id into v_team from team_members where user_id = me limit 1;
  if v_team is null then return null; end if;
  if p_period = 'day' then
    ls := date_trunc('day', ln) - make_interval(days => off); le := ls + interval '1 day'; lps := ls - interval '1 day'; unit := interval '1 hour';
  elsif p_period = 'month' then
    ls := date_trunc('month', ln) - make_interval(months => off); le := ls + interval '1 month'; lps := ls - interval '1 month'; unit := interval '1 day';
  else
    ls := date_trunc('week', ln) - make_interval(days => 7 * off); le := ls + interval '7 days'; lps := ls - interval '7 days'; unit := interval '1 day';
  end if;
  s := ls at time zone tz; e := le at time zone tz; ps := lps at time zone tz;

  with mem as (select m.user_id from team_members m where m.team_id = v_team and (m.user_id = me or not is_blocked(me, m.user_id))),
  pl as (
    select p.user_id, p.chart_id, p.played_at, p.broken, c.mode, c.level, c.song_id
      from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
     where p.user_id in (select user_id from mem) and p.played_at >= ps and p.played_at < e
  ),
  cur as (select * from pl where played_at >= s),
  prv as (select * from pl where played_at < s),
  -- clear novo: passou no período e não tinha passado antes (nem nas jogadas, nem no recorde já salvo)
  newc as (
    select distinct on (x.user_id, x.chart_id) x.user_id, x.chart_id, x.mode, x.level
      from cur x
     where not x.broken
       and not exists (select 1 from user_plays q where q.user_id = x.user_id and q.chart_id = x.chart_id and not q.broken and q.played_at < s)
       and not exists (select 1 from user_scores us where us.user_id = x.user_id and us.chart_id = x.chart_id and not coalesce(us.broken, false) and us.first_seen < s)
  ),
  newp as (
    select count(*) n from (
      select distinct x.user_id, x.chart_id from prv x
       where not x.broken
         and not exists (select 1 from user_plays q where q.user_id = x.user_id and q.chart_id = x.chart_id and not q.broken and q.played_at < ps)
         and not exists (select 1 from user_scores us where us.user_id = x.user_id and us.chart_id = x.chart_id and not coalesce(us.broken, false) and us.first_seen < ps)
    ) z
  )
  select jsonb_build_object(
    'period', coalesce(p_period, 'week'), 'offset', off,
    'start', s, 'end', e,
    'totals', (select jsonb_build_object(
        'plays', count(*), 'passes', count(*) filter (where not broken), 'active', count(distinct user_id),
        'songs', count(distinct song_id),
        'avg_level', round(avg(level) filter (where mode in ('S', 'D')), 1),
        'max_d', max(level) filter (where mode = 'D' and not broken), 'max_s', max(level) filter (where mode = 'S' and not broken),
        'new_clears', (select count(*) from newc)) from cur),
    'prev', (select jsonb_build_object(
        'plays', count(*), 'passes', count(*) filter (where not broken), 'active', count(distinct user_id),
        'new_clears', (select n from newp)) from prv),
    'series', (select coalesce(jsonb_agg(jsonb_build_array(extract(epoch from b.t)::bigint,
                  (select count(*) from cur where played_at >= b.t and played_at < b.t + unit and not broken),
                  (select count(*) from cur where played_at >= b.t and played_at < b.t + unit and broken)) order by b.t), '[]')
                 from (select generate_series(s, e - unit, unit) as t) b),
    'top', (select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.plays desc, t.passes desc), '[]') from (
              select x.chart_id, x.song_id, so.title, x.mode, x.level, count(*) plays, count(*) filter (where not x.broken) passes,
                     count(distinct x.user_id) players
                from cur x join songs so on so.id = x.song_id
               group by x.chart_id, x.song_id, so.title, x.mode, x.level
               order by count(*) desc, count(*) filter (where not x.broken) desc limit 8) t),
    'members', (select coalesce(jsonb_agg(row_to_json(m)::jsonb order by m.plays desc, m.passes desc), '[]') from (
              select mem.user_id as id, pr.nickname, pr.avatar_url as avatar,
                     count(x.*) plays, count(x.*) filter (where not x.broken) passes,
                     (select count(*) from newc n where n.user_id = mem.user_id) new_clears,
                     max(x.level) filter (where x.mode = 'D' and not x.broken) max_d,
                     max(x.level) filter (where x.mode = 'S' and not x.broken) max_s
                from mem
                left join cur x on x.user_id = mem.user_id
                left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = mem.user_id
                                    order by (p.version = p_version) desc, taken_at desc limit 1) pr on true
               group by mem.user_id, pr.nickname, pr.avatar_url) m)
  ) into out;
  return out;
end $$;
revoke all on function public.team_report(text, text, int) from public, anon;
grant execute on function public.team_report(text, text, int) to authenticated;

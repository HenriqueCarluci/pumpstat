-- 052: tela "Meu Time": os participantes com PUMBILITY, título e maior nível passado em Single e Double,
-- quem está online (respeitando a visibilidade de cada um) e a atividade do time na semana (só o total).
create or replace function public.my_team(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  tm as (select m.team_id from team_members m, me where m.user_id = me.id limit 1),
  mem as (select m.user_id, m.joined_at from team_members m join tm on tm.team_id = m.team_id),
  lvl as (
    select s.user_id,
           max(c.level) filter (where c.mode = 'S') as max_s,
           max(c.level) filter (where c.mode = 'D') as max_d,
           count(*) filter (where c.mode in ('S', 'D')) as clears
      from user_scores s join charts c on c.id = s.chart_id and c.version = p_version
     where s.user_id in (select user_id from mem) and not coalesce(s.broken, false)
     group by s.user_id
  ),
  week as (
    select count(*) as plays, count(*) filter (where not p.broken) as passes, count(distinct p.user_id) as active
      from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
     where p.user_id in (select user_id from mem) and p.played_at > now() - interval '7 days'
  )
  select case when not exists (select 1 from tm) then null else jsonb_build_object(
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city, 'logo', t.logo_url, 'instagram', t.instagram)
               from teams t join tm on tm.team_id = t.id),
    'week', (select jsonb_build_object('plays', plays, 'passes', passes, 'active', active) from week),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.user_id, 'me', m.user_id = (select id from me), 'joined', m.joined_at,
               'friend', are_friends((select id from me), m.user_id),
               'nickname', pr.nickname, 'title', pr.title, 'avatar', pr.avatar_url, 'pumbility', pr.pumbility,
               'max_s', l.max_s, 'max_d', l.max_d, 'clears', coalesce(l.clears, 0),
               'online', exists (select 1 from user_presence up where up.user_id = m.user_id and up.last_seen > now() - interval '3 minutes'
                                  and (up.mode = 'all' or (up.mode = 'friends' and are_friends((select id from me), m.user_id))))
             ) order by pr.pumbility desc nulls last), '[]'::jsonb)
        from mem m
        left join lvl l on l.user_id = m.user_id
        left join lateral (select nickname, title, avatar_url, pumbility from user_profiles p
                            where p.user_id = m.user_id and p.version = p_version order by taken_at desc limit 1) pr on true
       where not is_blocked((select id from me), m.user_id) or m.user_id = (select id from me)
    )) end
$$;
revoke all on function public.my_team(text) from public, anon;
grant execute on function public.my_team(text) to authenticated;

-- Times para quem ainda não vinculou a AM.PASS: pode pedir/entrar no time e aparece com um nome tirado da conta
-- (nome do Google ou o começo do e-mail, mascarado). Ao vincular, o nick da Pump passa a valer sozinho.

create or replace function public.account_label(p_user uuid)
 returns text language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    left(split_part(u.email, '@', 1), 3) || '•••@' || split_part(u.email, '@', 2))
  from auth.users u where u.id = p_user
$$;
revoke execute on function public.account_label(uuid) from public, anon, authenticated;

create or replace function public.has_pump(p_user uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from piu_accounts a where a.user_id = p_user and a.game_id is not null) $$;
revoke execute on function public.has_pump(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_team_members(p_team bigint)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  perform admin_guard('venues');
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'role', m.role,
                             'nickname', coalesce(pr.nickname, account_label(m.user_id)), 'no_pump', not has_pump(m.user_id), 'avatar', pr.avatar_url)
                           order by (m.role = 'admin') desc, lower(coalesce(pr.nickname, account_label(m.user_id))))
                         from team_members m
                         left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = m.user_id order by taken_at desc limit 1) pr on true
                        where m.team_id = p_team), '[]'::jsonb),
    'requests', (select count(*) from team_join_requests where team_id = p_team));
end $function$;

CREATE OR REPLACE FUNCTION public.my_team(p_version text DEFAULT 'phoenix2'::text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id),
  tm as (select m.team_id, m.role from team_members m, me where m.user_id = me.id limit 1),
  mem as (select m.user_id, m.joined_at, m.role from team_members m join tm on tm.team_id = m.team_id),
  lvl as (
    select s.user_id,
           max(c.level) filter (where c.mode = 'S') as max_s,
           max(c.level) filter (where c.mode = 'D') as max_d,
           count(*) filter (where c.mode in ('S', 'D')) as clears
      from visible_scores s join charts c on c.id = s.chart_id and c.version = p_version
     where s.user_id in (select user_id from mem) and not coalesce(s.broken, false)
     group by s.user_id
  ),
  week as (
    select count(*) as plays, count(*) filter (where not p.broken) as passes, count(distinct p.user_id) as active
      from visible_plays p join charts c on c.id = p.chart_id and c.version = p_version
     where p.user_id in (select user_id from mem) and p.played_at > now() - interval '7 days'
  )
  select case when not exists (select 1 from tm) then null else jsonb_build_object(
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city, 'logo', t.logo_url, 'instagram', t.instagram, 'socials', t.socials)
               from teams t join tm on tm.team_id = t.id),
    'am_admin', (select role = 'admin' from tm),
    'week', (select jsonb_build_object('plays', plays, 'passes', passes, 'active', active) from week),
    'requests', case when (select role from tm) = 'admin' then (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'at', r.created_at,
               'nickname', coalesce(pr.nickname, account_label(r.user_id)), 'no_pump', not has_pump(r.user_id), 'title', pr.title,
               'avatar', pr.avatar_url, 'pumbility', pr.pumbility) order by r.created_at), '[]'::jsonb)
        from team_join_requests r
        left join lateral (select nickname, title, avatar_url, pumbility from visible_profiles p
                            where p.user_id = r.user_id order by (p.version = p_version) desc, taken_at desc limit 1) pr on true
       where r.team_id = (select team_id from tm)) else '[]'::jsonb end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.user_id, 'me', m.user_id = (select id from me), 'joined', m.joined_at, 'admin', m.role = 'admin',
               'friend', are_friends((select id from me), m.user_id),
               'nickname', coalesce(pr.nickname, any_nick.nickname, account_label(m.user_id)), 'no_pump', not has_pump(m.user_id),
               'title', pr.title, 'avatar', coalesce(pr.avatar_url, any_nick.avatar_url), 'pumbility', pr.pumbility,
               'max_s', l.max_s, 'max_d', l.max_d, 'clears', coalesce(l.clears, 0),
               'online', exists (select 1 from user_presence up where up.user_id = m.user_id and up.last_seen > now() - interval '3 minutes'
                                  and (up.mode = 'all' or (up.mode = 'friends' and are_friends((select id from me), m.user_id))))
             ) order by pr.pumbility desc nulls last), '[]'::jsonb)
        from mem m
        left join lvl l on l.user_id = m.user_id
        left join lateral (select nickname, title, avatar_url, pumbility from visible_profiles p
                            where p.user_id = m.user_id and p.version = p_version order by taken_at desc limit 1) pr on true
        left join lateral (select nickname, avatar_url from visible_profiles p
                            where p.user_id = m.user_id order by taken_at desc limit 1) any_nick on true
       where not is_blocked((select id from me), m.user_id) or m.user_id = (select id from me)
    )) end
$function$;

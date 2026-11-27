-- Administradores de time: quem cria o time vira admin; times com admin pedem aprovação para entrar.

alter table public.team_members add column if not exists role text not null default 'member';
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('member', 'admin'));

-- quem pediu o cadastro de um time aprovado vira admin dele
update public.team_members m set role = 'admin'
  from public.teams t where t.id = m.team_id and t.created_by = m.user_id and m.role <> 'admin';

create table if not exists public.team_join_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists team_join_requests_team on public.team_join_requests (team_id);
alter table public.team_join_requests enable row level security;

create or replace function public.is_team_admin(p_user uuid, p_team bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = p_user and team_id = p_team and role = 'admin')
$$;
revoke all on function public.is_team_admin(uuid, bigint) from public, anon, authenticated;

-- entrar/sair: em time com admin, vira pedido (o jogador continua no time atual até ser aprovado)
drop function if exists public.set_my_team(bigint);
create function public.set_my_team(p_team bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_name text; a uuid;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_team is null then
    delete from team_members where user_id = me;
    delete from team_join_requests where user_id = me;
    return jsonb_build_object('status', 'left');
  end if;
  select name into v_name from teams where id = p_team and status = 'approved';
  if not found then raise exception 'time não encontrado'; end if;
  if exists (select 1 from team_members where user_id = me and team_id = p_team) then
    delete from team_join_requests where user_id = me;
    return jsonb_build_object('status', 'joined');
  end if;
  if exists (select 1 from team_members where team_id = p_team and role = 'admin') then
    if exists (select 1 from team_join_requests where user_id = me and team_id = p_team) then
      return jsonb_build_object('status', 'pending');
    end if;
    insert into team_join_requests (user_id, team_id) values (me, p_team)
    on conflict (user_id) do update set team_id = excluded.team_id, created_at = now();
    for a in select user_id from team_members where team_id = p_team and role = 'admin' loop
      perform notify(a, 'team_join_request', me, p_team::text, jsonb_build_object('name', v_name, 'team', p_team));
    end loop;
    return jsonb_build_object('status', 'pending');
  end if;
  delete from team_join_requests where user_id = me;
  insert into team_members (user_id, team_id) values (me, p_team)
  on conflict (user_id) do update set team_id = excluded.team_id, joined_at = now(), role = 'member';
  return jsonb_build_object('status', 'joined');
end $$;
revoke all on function public.set_my_team(bigint) from public, anon;
grant execute on function public.set_my_team(bigint) to authenticated;

create or replace function public.cancel_team_request()
returns void language sql security definer set search_path = public as $$
  delete from team_join_requests where user_id = auth.uid()
$$;
revoke all on function public.cancel_team_request() from public, anon;
grant execute on function public.cancel_team_request() to authenticated;

-- admin do time aprova ou recusa um pedido
create or replace function public.team_review_request(p_user uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r team_join_requests; v_name text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select * into r from team_join_requests where user_id = p_user for update;
  if not found then raise exception 'Esse pedido não existe mais.'; end if;
  if not is_team_admin(me, r.team_id) then raise exception 'Só os administradores do time podem fazer isso.'; end if;
  select name into v_name from teams where id = r.team_id;
  delete from team_join_requests where user_id = p_user;
  if p_approve then
    insert into team_members (user_id, team_id) values (p_user, r.team_id)
    on conflict (user_id) do update set team_id = excluded.team_id, joined_at = now(), role = 'member';
    perform notify(p_user, 'team_join_approved', me, r.team_id::text, jsonb_build_object('name', v_name));
  else
    perform notify(p_user, 'team_join_rejected', me, r.team_id::text, jsonb_build_object('name', v_name));
  end if;
end $$;
revoke all on function public.team_review_request(uuid, boolean) from public, anon;
grant execute on function public.team_review_request(uuid, boolean) to authenticated;

-- admin do time: dar/tirar admin de um participante (sempre fica ao menos um admin)
create or replace function public.team_set_admin(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_team bigint; v_name text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select team_id into v_team from team_members where user_id = me and role = 'admin';
  if v_team is null then raise exception 'Só os administradores do time podem fazer isso.'; end if;
  if not exists (select 1 from team_members where user_id = p_user and team_id = v_team) then
    raise exception 'Esse jogador não está no time.';
  end if;
  if not p_on and (select count(*) from team_members where team_id = v_team and role = 'admin' and user_id <> p_user) = 0 then
    raise exception 'O time precisa ter pelo menos um administrador.';
  end if;
  update team_members set role = case when p_on then 'admin' else 'member' end where user_id = p_user and team_id = v_team;
  if p_on then
    select name into v_name from teams where id = v_team;
    perform notify(p_user, 'team_admin', me, v_team::text, jsonb_build_object('name', v_name));
  end if;
end $$;
revoke all on function public.team_set_admin(uuid, boolean) from public, anon;
grant execute on function public.team_set_admin(uuid, boolean) to authenticated;

-- admin do time: tirar um participante (admins não podem ser tirados por outro admin; primeiro tire o admin)
create or replace function public.team_remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_team bigint;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select team_id into v_team from team_members where user_id = me and role = 'admin';
  if v_team is null then raise exception 'Só os administradores do time podem fazer isso.'; end if;
  if p_user = me then raise exception 'Para sair do time, use Ajustes.'; end if;
  if exists (select 1 from team_members where user_id = p_user and team_id = v_team and role = 'admin') then
    raise exception 'Tire o cargo de administrador antes.';
  end if;
  delete from team_members where user_id = p_user and team_id = v_team;
end $$;
revoke all on function public.team_remove_member(uuid) from public, anon;
grant execute on function public.team_remove_member(uuid) to authenticated;

-- admin do site: participantes e admins de um time
create or replace function public.admin_team_members(p_team bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('venues');
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'role', m.role, 'nickname', pr.nickname, 'avatar', pr.avatar_url)
                           order by (m.role = 'admin') desc, lower(pr.nickname))
                         from team_members m
                         left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = m.user_id order by taken_at desc limit 1) pr on true
                        where m.team_id = p_team), '[]'::jsonb),
    'requests', (select count(*) from team_join_requests where team_id = p_team));
end $$;
revoke all on function public.admin_team_members(bigint) from public, anon;
grant execute on function public.admin_team_members(bigint) to authenticated;

-- admin do site: define um admin do time pelo nick (o jogador entra no time se ainda não estiver) ou tira o cargo
create or replace function public.admin_set_team_admin(p_team bigint, p_nick text, p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := p_user; n int; v_name text;
begin
  perform admin_guard('venues');
  select name into v_name from teams where id = p_team and status = 'approved';
  if not found then raise exception 'time não encontrado'; end if;
  if v_user is null then
    select count(distinct user_id), min(user_id::text)::uuid into n, v_user
      from user_profiles where lower(replace(nickname, ' ', '')) = lower(replace(coalesce(p_nick, ''), ' ', ''))
         or lower(trim(regexp_replace(nickname, '\s*#.*$', ''))) = lower(trim(coalesce(p_nick, '')));
    if n = 0 then raise exception 'Nenhum jogador com esse nick.'; end if;
    if n > 1 then raise exception 'Mais de um jogador com esse nick: use o nick completo, com o #.'; end if;
  end if;
  if p_on then
    insert into team_members (user_id, team_id, role) values (v_user, p_team, 'admin')
    on conflict (user_id) do update set team_id = excluded.team_id, role = 'admin',
      joined_at = case when team_members.team_id = excluded.team_id then team_members.joined_at else now() end;
    delete from team_join_requests where user_id = v_user;
    perform notify(v_user, 'team_admin', auth.uid(), p_team::text, jsonb_build_object('name', v_name));
  else
    update team_members set role = 'member' where user_id = v_user and team_id = p_team;
  end if;
end $$;
revoke all on function public.admin_set_team_admin(bigint, text, uuid, boolean) from public, anon;
grant execute on function public.admin_set_team_admin(bigint, text, uuid, boolean) to authenticated;

-- quem pede o cadastro do time vira admin dele quando aprovado
create or replace function public.admin_review_team(p_id bigint, p_approve boolean, p_name text, p_tag text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare t teams;
begin
  perform admin_guard('venues');
  select * into t from teams where id = p_id for update;
  if not found then raise exception 'time não encontrado'; end if;
  if p_approve then
    update teams set status = 'approved', name = coalesce(nullif(trim(p_name), ''), name),
           tag = coalesce(nullif(upper(trim(p_tag)), ''), tag), admin_note = nullif(trim(p_note), ''), reviewed_at = now()
     where id = p_id;
    if t.created_by is not null then
      insert into team_members (user_id, team_id, role) values (t.created_by, p_id, 'admin')
      on conflict (user_id) do update set team_id = excluded.team_id, role = 'admin', joined_at = now();
      delete from team_join_requests where user_id = t.created_by;
      perform notify(t.created_by, 'team_approved', auth.uid(), p_id::text, jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), t.name)));
    end if;
  else
    update teams set status = 'rejected', admin_note = nullif(trim(p_note), ''), reviewed_at = now() where id = p_id;
    delete from team_members where team_id = p_id;
    delete from team_join_requests where team_id = p_id;
    perform notify(t.created_by, 'team_rejected', auth.uid(), p_id::text, jsonb_build_object('name', t.name, 'note', nullif(trim(p_note), '')));
  end if;
end $$;

-- lista de times: se o time tem admin (entrada com aprovação), meu cargo e meu pedido em aberto
create or replace function public.list_teams()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city,
               'logo', t.logo_url, 'instagram', t.instagram,
               'members', (select count(*) from team_members m where m.team_id = t.id),
               'approval', exists (select 1 from team_members m where m.team_id = t.id and m.role = 'admin')) order by lower(t.name))
             from teams t where t.status = 'approved'), '[]'::jsonb),
    'mine', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo_url, 'instagram', t.instagram, 'socials', t.socials,
                                       'admin', m.role = 'admin')
               from team_members m join teams t on t.id = m.team_id where m.user_id = auth.uid()),
    'requested', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo_url, 'at', r.created_at)
                    from team_join_requests r join teams t on t.id = r.team_id where r.user_id = auth.uid()),
    'pending', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo_url, 'status', t.status, 'admin_note', t.admin_note)
                  from teams t where t.created_by = auth.uid() and (t.status = 'pending' or (t.status = 'rejected' and t.reviewed_at > now() - interval '14 days'))
                 order by t.created_at desc limit 1))
$$;

-- Meu Time: cargo de cada participante e, para os admins, os pedidos para entrar
create or replace function public.my_team(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
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
      select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'at', r.created_at, 'nickname', pr.nickname, 'title', pr.title,
               'avatar', pr.avatar_url, 'pumbility', pr.pumbility) order by r.created_at), '[]'::jsonb)
        from team_join_requests r
        left join lateral (select nickname, title, avatar_url, pumbility from visible_profiles p
                            where p.user_id = r.user_id order by (p.version = p_version) desc, taken_at desc limit 1) pr on true
       where r.team_id = (select team_id from tm)) else '[]'::jsonb end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.user_id, 'me', m.user_id = (select id from me), 'joined', m.joined_at, 'admin', m.role = 'admin',
               'friend', are_friends((select id from me), m.user_id),
               'nickname', pr.nickname, 'title', pr.title, 'avatar', pr.avatar_url, 'pumbility', pr.pumbility,
               'max_s', l.max_s, 'max_d', l.max_d, 'clears', coalesce(l.clears, 0),
               'online', exists (select 1 from user_presence up where up.user_id = m.user_id and up.last_seen > now() - interval '3 minutes'
                                  and (up.mode = 'all' or (up.mode = 'friends' and are_friends((select id from me), m.user_id))))
             ) order by pr.pumbility desc nulls last), '[]'::jsonb)
        from mem m
        left join lvl l on l.user_id = m.user_id
        left join lateral (select nickname, title, avatar_url, pumbility from visible_profiles p
                            where p.user_id = m.user_id and p.version = p_version order by taken_at desc limit 1) pr on true
       where not is_blocked((select id from me), m.user_id) or m.user_id = (select id from me)
    )) end
$$;

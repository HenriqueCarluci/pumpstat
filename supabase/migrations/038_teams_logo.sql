-- Times: logo e Instagram; pré-cadastro do Team L'Aqua (São Paulo).
alter table public.teams add column if not exists logo_url text check (logo_url is null or (length(logo_url) <= 300 and logo_url ~ '^(/|https://)[^[:space:]]+$'));
alter table public.teams add column if not exists instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');

create or replace function public.list_teams()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city,
               'logo', t.logo_url, 'instagram', t.instagram,
               'members', (select count(*) from team_members m where m.team_id = t.id)) order by lower(t.name))
             from teams t where t.status = 'approved'), '[]'::jsonb),
    'mine', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo_url, 'instagram', t.instagram)
               from team_members m join teams t on t.id = m.team_id where m.user_id = auth.uid()),
    'pending', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'status', t.status, 'admin_note', t.admin_note)
                  from teams t where t.created_by = auth.uid() and (t.status = 'pending' or (t.status = 'rejected' and t.reviewed_at > now() - interval '14 days'))
                 order by t.created_at desc limit 1))
$$;

create or replace function public.teams_of(p_users uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(m.user_id, jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo_url)), '{}'::jsonb)
    from team_members m join teams t on t.id = m.team_id and t.status = 'approved'
   where m.user_id = any(p_users[1:300]) and auth.uid() is not null
$$;

insert into public.teams (name, tag, city, status, logo_url, instagram, admin_note, reviewed_at)
select 'Team L''Aqua', 'LAQUA', 'São Paulo - SP', 'approved', '/teams/laqua.jpg', 'team.laqua', 'Pré-cadastro do admin', now()
 where not exists (select 1 from public.teams where lower(name) = lower('Team L''Aqua') and status <> 'rejected');

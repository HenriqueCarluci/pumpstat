-- 029: administradores do app, planos (grátis / StepClub+) e gestão de usuários
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- dono do app (Henrique, CARLUCI)
insert into public.app_admins (user_id) values ('40aa4afc-f38b-47a8-a9e5-707ae184c83e') on conflict do nothing;

create or replace function public.is_app_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = p_user)
$$;
revoke all on function public.is_app_admin(uuid) from public, anon;
grant execute on function public.is_app_admin(uuid) to authenticated;

create table if not exists public.subscriptions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'plus' check (plan in ('plus')),
  source     text not null check (source in ('store', 'comp', 'lifetime')),  -- loja, cortesia, vitalício
  expires_at timestamptz,                                                     -- null = sem prazo
  note       text,
  granted_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "dono" on public.subscriptions;
create policy "dono" on public.subscriptions for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.subscriptions from anon, authenticated;

alter table public.feedback add column if not exists status text not null default 'open' check (status in ('open', 'done'));

-- plano do usuário logado
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', case when s.user_id is not null and (s.expires_at is null or s.expires_at > now()) then 'plus' else 'free' end,
    'source', s.source, 'expires_at', s.expires_at,
    'admin', is_app_admin(auth.uid()))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me
   where auth.uid() is not null
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

create or replace function public.admin_guard()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_app_admin(auth.uid()) then raise exception 'só administradores' using errcode = '42501'; end if;
end $$;
revoke all on function public.admin_guard() from public, anon, authenticated;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform admin_guard();
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'online', (select count(*) from user_presence where last_seen > now() - interval '3 minutes'),
    'linked', (select count(*) from piu_accounts),
    'plus', (select count(*) from subscriptions where expires_at is null or expires_at > now()),
    'feedback_open', (select count(*) from feedback where status = 'open'),
    'banned', (select count(*) from auth.users where banned_until > now()));
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.admin_users(p_query text default '', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform admin_guard();
  return (select coalesce(jsonb_agg(x order by created_at desc), '[]') from (
    select jsonb_build_object(
             'id', u.id, 'email', u.email, 'provider', u.raw_app_meta_data->>'provider',
             'created_at', u.created_at, 'last_sign_in', u.last_sign_in_at,
             'banned', u.banned_until is not null and u.banned_until > now(),
             'nickname', pr.nickname, 'title', pr.title, 'avatar', pr.avatar_url, 'pumbility', pr.pumbility,
             'linked', a.user_id is not null, 'last_sync', a.last_sync_at,
             'last_seen', pp.last_seen, 'admin', is_app_admin(u.id),
             'plan', case when s.user_id is not null and (s.expires_at is null or s.expires_at > now()) then 'plus' else 'free' end,
             'plan_source', s.source, 'plan_expires', s.expires_at, 'plan_note', s.note) as x,
           u.created_at
      from auth.users u
      left join piu_accounts a on a.user_id = u.id
      left join user_presence pp on pp.user_id = u.id
      left join subscriptions s on s.user_id = u.id
      left join lateral (select nickname, title, avatar_url, pumbility from user_profiles p where p.user_id = u.id
                          order by (p.version = 'phoenix2') desc, taken_at desc limit 1) pr on true
     where q is null or u.email ilike '%' || q || '%' or pr.nickname ilike '%' || q || '%'
     order by u.created_at desc
     limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) z);
end $$;
revoke all on function public.admin_users(text, int, int) from public, anon;
grant execute on function public.admin_users(text, int, int) to authenticated;

-- libera o StepClub+ como cortesia (p_days null = sem prazo) ou remove (p_plan = 'free')
create or replace function public.admin_set_plan(p_user uuid, p_plan text, p_days int default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_plan = 'free' then
    delete from subscriptions where user_id = p_user and source <> 'store';
  elsif p_plan = 'plus' then
    insert into subscriptions (user_id, plan, source, expires_at, note, granted_by, updated_at)
    values (p_user, 'plus', case when p_days is null then 'lifetime' else 'comp' end,
            case when p_days is null then null else now() + make_interval(days => p_days) end,
            left(p_note, 200), auth.uid(), now())
    on conflict (user_id) do update set plan = 'plus', source = excluded.source, expires_at = excluded.expires_at,
      note = excluded.note, granted_by = excluded.granted_by, updated_at = now();
  else
    raise exception 'opção inválida';
  end if;
end $$;
revoke all on function public.admin_set_plan(uuid, text, int, text) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, int, text) to authenticated;

-- bloqueia (impede login e renovação da sessão) ou desbloqueia uma conta
create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform admin_guard();
  if p_user = auth.uid() then raise exception 'você não pode bloquear a si mesmo'; end if;
  if p_banned and is_app_admin(p_user) then raise exception 'remova o acesso de administrador antes de bloquear'; end if;
  update auth.users set banned_until = case when p_banned then now() + interval '100 years' else null end where id = p_user;
  if p_banned then
    delete from auth.refresh_tokens where user_id::text = p_user::text;
    update user_presence set last_seen = now() - interval '1 day' where user_id = p_user;
  end if;
end $$;
revoke all on function public.admin_set_banned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_admin then
    insert into app_admins (user_id, added_by) values (p_user, auth.uid()) on conflict do nothing;
  else
    if p_user = auth.uid() then raise exception 'você não pode remover o próprio acesso'; end if;
    delete from app_admins where user_id = p_user;
  end if;
end $$;
revoke all on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;

create or replace function public.admin_feedback(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform admin_guard();
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'kind', f.kind, 'message', f.message, 'contact', f.contact, 'meta', f.meta,
            'emailed', f.emailed, 'status', f.status, 'at', f.created_at,
            'user', f.user_id, 'email', u.email,
            'nickname', (select nickname from user_profiles p where p.user_id = f.user_id order by taken_at desc limit 1))
          order by f.created_at desc), '[]')
    from feedback f left join auth.users u on u.id = f.user_id
   where p_status = 'all' or f.status = p_status);
end $$;
revoke all on function public.admin_feedback(text) from public, anon;
grant execute on function public.admin_feedback(text) to authenticated;

create or replace function public.admin_feedback_status(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_status not in ('open', 'done') then raise exception 'opção inválida'; end if;
  update feedback set status = p_status where id = p_id;
end $$;
revoke all on function public.admin_feedback_status(bigint, text) from public, anon;
grant execute on function public.admin_feedback_status(bigint, text) to authenticated;

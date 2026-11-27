-- 091: Permissões da equipe ajustáveis por pessoa (matriz em Admin → Equipe, só o dono).
-- Cada perfil tem as permissões padrão (admin_perms); o dono pode dar ou tirar permissões de uma pessoa específica.
-- Não vale para donos e a permissão de gerenciar a equipe (roles) não pode ser dada por aqui.

create table if not exists public.admin_perm_overrides (
  user_id uuid not null references auth.users on delete cascade,
  perm text not null,
  allow boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, perm)
);
alter table public.admin_perm_overrides enable row level security;

create or replace function public.effective_perms(p_user uuid)
returns text[] language sql stable security definer set search_path = public as $$
  with r as (select admin_role(p_user) as role)
  select case
    when r.role is null then array[]::text[]
    when r.role = 'owner' then admin_perms('owner')
    else coalesce((
      select array_agg(p order by p) from (
        select unnest(admin_perms(r.role)) as p
        except select o.perm from admin_perm_overrides o where o.user_id = p_user and not o.allow
        union select o.perm from admin_perm_overrides o where o.user_id = p_user and o.allow and o.perm <> 'roles'
      ) x), array[]::text[])
  end from r
$$;
revoke all on function public.effective_perms(uuid) from public, anon, authenticated;

create or replace function public.has_admin_perm(p_perm text, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_perm = any(effective_perms(p_user)), false)
$$;
revoke all on function public.has_admin_perm(text, uuid) from public, anon;

do $$
begin
  execute replace(pg_get_functiondef('public.my_plan()'::regprocedure),
    'to_jsonb(admin_perms(admin_role(auth.uid())))', 'to_jsonb(effective_perms(auth.uid()))');
  execute replace(pg_get_functiondef('public.tg_admin_new_user()'::regprocedure),
    '''users'' = any(admin_perms(a.role))', 'has_admin_perm(''users'', a.user_id)');
end $$;

create or replace function public.admin_perm_matrix()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('roles');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.user_id, 'role', a.role,
      'email', (select u.email from auth.users u where u.id = a.user_id),
      'nickname', (select p.nickname from user_profiles p where p.user_id = a.user_id order by p.taken_at desc limit 1),
      'perms', to_jsonb(effective_perms(a.user_id)),
      'defaults', to_jsonb(admin_perms(a.role)),
      'overrides', coalesce((select jsonb_object_agg(o.perm, o.allow) from admin_perm_overrides o where o.user_id = a.user_id), '{}'::jsonb))
    order by (a.role = 'owner') desc, a.role) from app_admins a), '[]'::jsonb);
end $$;
revoke all on function public.admin_perm_matrix() from public, anon;
grant execute on function public.admin_perm_matrix() to authenticated;

-- p_allow: true = dar, false = tirar, null = voltar ao padrão do perfil
create or replace function public.admin_set_perm_override(p_user uuid, p_perm text, p_allow boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('roles');
  if p_perm not in ('plans','view_as','stats','health','users','ban','reports','feedback','charts','events','venues','ads','config') then
    raise exception 'permissão inválida';
  end if;
  if admin_role(p_user) is null then raise exception 'esta pessoa não está na equipe'; end if;
  if admin_role(p_user) = 'owner' then raise exception 'o dono já tem todas as permissões'; end if;
  if p_allow is null then
    delete from admin_perm_overrides where user_id = p_user and perm = p_perm;
  else
    insert into admin_perm_overrides (user_id, perm, allow) values (p_user, p_perm, p_allow)
    on conflict (user_id, perm) do update set allow = excluded.allow, updated_at = now();
  end if;
end $$;
revoke all on function public.admin_set_perm_override(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_perm_override(uuid, text, boolean) to authenticated;

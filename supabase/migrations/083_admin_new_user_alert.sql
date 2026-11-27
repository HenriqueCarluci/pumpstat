-- 083: Alerta para a equipe quando alguém cria conta no PIU Stats.
-- Vai para quem tem a permissão 'users' (dono, admin geral, moderação, suporte) e não desligou o aviso em Ajustes.

alter table public.user_settings add column if not exists notify_new_users boolean not null default true;

create or replace function public.tg_admin_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, actor, ref, payload)
  select a.user_id, 'admin_new_user', null, new.id::text,
         jsonb_build_object('email', new.email, 'provider', coalesce(new.raw_app_meta_data->>'provider', 'email'), 'new_user', new.id)
    from app_admins a
   where 'users' = any(admin_perms(a.role)) and a.user_id <> new.id
     and coalesce((select s.notify_new_users from user_settings s where s.user_id = a.user_id), true);
  return new;
exception when others then
  return new; -- o aviso nunca pode impedir o cadastro
end $$;

drop trigger if exists admin_new_user_alert on auth.users;
create trigger admin_new_user_alert after insert on auth.users
  for each row execute function public.tg_admin_new_user();

create or replace function public.admin_new_users(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('users');
  return jsonb_build_object(
    'day', (select count(*) from auth.users u where u.created_at > now() - interval '1 day'),
    'week', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'notify', coalesce((select s.notify_new_users from user_settings s where s.user_id = auth.uid()), true),
    'list', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select u.id, u.email, coalesce(u.raw_app_meta_data->>'provider', 'email') as provider, u.created_at,
               (select p.nickname from user_profiles p where p.user_id = u.id order by p.taken_at desc limit 1) as nickname
          from auth.users u
         where u.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
         order by u.created_at desc limit 20) x), '[]'::jsonb));
end $$;
revoke all on function public.admin_new_users(int) from public, anon;
grant execute on function public.admin_new_users(int) to authenticated;

create or replace function public.admin_set_new_user_alert(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('users');
  insert into user_settings (user_id, notify_new_users) values (auth.uid(), coalesce(p_on, true))
  on conflict (user_id) do update set notify_new_users = excluded.notify_new_users;
end $$;
revoke all on function public.admin_set_new_user_alert(boolean) from public, anon;
grant execute on function public.admin_set_new_user_alert(boolean) to authenticated;

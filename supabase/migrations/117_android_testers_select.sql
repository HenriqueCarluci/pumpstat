-- 117: o admin escolhe quem entra no teste do app Android e quem recebe os avisos de versão nova.
-- Quem já estava na lista continua recebendo; pedidos novos chegam com os avisos desligados até o admin liberar.
alter table public.android_testers add column if not exists notify boolean not null default false;
alter table public.android_testers add column if not exists by_admin boolean not null default false;
update public.android_testers set notify = true where added and not notify;

create or replace function public.admin_android_testers()
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  perform admin_guard('users');
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'email', t.email, 'added', t.added, 'notify', t.notify,
      'by_admin', t.by_admin, 'at', t.created_at,
      'nick', coalesce((select pr.nickname from user_profiles pr where pr.user_id = t.user_id and pr.nickname is not null limit 1), account_label(t.user_id)))
      order by t.added, t.created_at desc)
    from android_testers t), '[]'::jsonb);
end $$;

-- ligar/desligar os avisos de versão nova
create or replace function public.admin_android_testers_notify(p_users uuid[], p_on boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform admin_guard('users');
  update android_testers set notify = p_on where user_id = any (p_users);
end $$;
revoke all on function public.admin_android_testers_notify(uuid[], boolean) from public, anon;
grant execute on function public.admin_android_testers_notify(uuid[], boolean) to authenticated;

-- usuários que ainda não estão no teste (para o admin escolher); busca por nick ou e-mail
create or replace function public.admin_android_candidates(p_q text default '')
 returns jsonb language plpgsql security definer set search_path to 'public', 'auth'
as $$
declare q text := lower(trim(coalesce(p_q, '')));
begin
  perform admin_guard('users');
  return coalesce((select jsonb_agg(x order by x->>'at' desc) from (
    select jsonb_build_object('user_id', u.id, 'email', u.email, 'at', u.created_at,
             'provider', coalesce(u.raw_app_meta_data->>'provider', 'email'),
             'nick', coalesce((select pr.nickname from user_profiles pr where pr.user_id = u.id and pr.nickname is not null limit 1), account_label(u.id))) x
      from auth.users u
     where u.email is not null and u.email !~* '\.invalid$'
       and not exists (select 1 from android_testers t where t.user_id = u.id)
       and (q = '' or lower(u.email) like '%' || q || '%'
            or exists (select 1 from user_profiles pr where pr.user_id = u.id and lower(pr.nickname) like '%' || q || '%'))
     order by u.created_at desc
     limit 40) s), '[]'::jsonb);
end $$;
revoke all on function public.admin_android_candidates(text) from public, anon;
grant execute on function public.admin_android_candidates(text) to authenticated;

-- inclui as pessoas escolhidas (com o e-mail da conta), já com os avisos ligados; falta pôr o e-mail no Play Console
create or replace function public.admin_android_testers_add(p_users uuid[])
 returns int language plpgsql security definer set search_path to 'public', 'auth'
as $$
declare n int;
begin
  perform admin_guard('users');
  insert into android_testers (user_id, email, added, notify, by_admin)
  select u.id, lower(u.email), false, true, true
    from auth.users u
   where u.id = any (p_users) and u.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and u.email !~* '\.invalid$'
  on conflict (user_id) do update set notify = true;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.admin_android_testers_add(uuid[]) from public, anon;
grant execute on function public.admin_android_testers_add(uuid[]) to authenticated;

-- aviso de versão nova: só quem está na lista do Play e com os avisos ligados
create or replace function public.admin_notify_android_testers(p_version text)
 returns integer language plpgsql security definer set search_path to 'public'
as $$
declare n int;
begin
  perform admin_guard('users');
  if coalesce(trim(p_version), '') = '' or length(p_version) > 20 then raise exception 'Informe a versão (ex.: 1.0.105).'; end if;
  insert into notifications (user_id, kind, ref, payload)
  select t.user_id, 'app_update', 'android:' || trim(p_version),
         jsonb_build_object('version', trim(p_version), 'link', 'https://play.google.com/store/apps/details?id=com.henriquecarluci.stepclub')
    from android_testers t
   where t.added and t.notify
     and not exists (select 1 from notifications x where x.user_id = t.user_id and x.kind = 'app_update' and x.ref = 'android:' || trim(p_version));
  get diagnostics n = row_count;
  return n;
end $$;

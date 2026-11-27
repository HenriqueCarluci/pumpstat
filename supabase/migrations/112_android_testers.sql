-- Quem quer testar o app Android: a pessoa pede pelo app (com o e-mail da conta Google) e o admin copia a lista para o Play Console.
create table if not exists public.android_testers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  added boolean not null default false,       -- já está na lista do Play Console
  created_at timestamptz not null default now()
);
alter table public.android_testers enable row level security;
revoke all on public.android_testers from anon, authenticated;

create or replace function public.android_tester_status()
 returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'joined', t.user_id is not null, 'added', coalesce(t.added, false), 'email', t.email,
    'link', coalesce(nullif(app_config()->>'android_test_link', ''), 'https://play.google.com/apps/internaltest/4701607039296929447'))
  from (select 1) x left join android_testers t on t.user_id = auth.uid()
$$;
grant execute on function public.android_tester_status() to authenticated;

create or replace function public.android_tester_join(p_email text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v text := lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para pedir o teste.'; end if;
  if v !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  insert into android_testers (user_id, email) values (auth.uid(), v)
  on conflict (user_id) do update set email = excluded.email,
    added = case when android_testers.email = excluded.email then android_testers.added else false end;
  return android_tester_status();
end $$;
grant execute on function public.android_tester_join(text) to authenticated;

create or replace function public.android_tester_leave()
 returns void language sql security definer set search_path to 'public'
as $$ delete from android_testers where user_id = auth.uid() $$;
grant execute on function public.android_tester_leave() to authenticated;

create or replace function public.admin_android_testers()
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  perform admin_guard('users');
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'email', t.email, 'added', t.added, 'at', t.created_at,
      'nick', coalesce((select pr.nickname from user_profiles pr where pr.user_id = t.user_id and pr.nickname is not null limit 1), account_label(t.user_id)))
      order by t.added, t.created_at desc)
    from android_testers t), '[]'::jsonb);
end $$;
revoke all on function public.admin_android_testers() from public, anon;
grant execute on function public.admin_android_testers() to authenticated;

create or replace function public.admin_android_testers_mark(p_users uuid[], p_added boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  perform admin_guard('users');
  update android_testers set added = p_added where user_id = any (p_users);
end $$;
revoke all on function public.admin_android_testers_mark(uuid[], boolean) from public, anon;
grant execute on function public.admin_android_testers_mark(uuid[], boolean) to authenticated;

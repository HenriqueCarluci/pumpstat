-- Contas de teste (dummy) para o admin ver o app em situações específicas pelo "ver como" (só leitura).
-- Primeira: conta sem AM.PASS vinculada. Não entra nos números do app e não tem senha (ninguém faz login nela).
create table if not exists public.test_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);
alter table public.test_accounts enable row level security;
revoke all on public.test_accounts from anon, authenticated;

do $$
declare v uuid;
begin
  if exists (select 1 from public.test_accounts where kind = 'no_pump') then return; end if;
  v := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', 'teste-sem-pump@piustats.invalid', '', now(),
          '{"provider":"email","providers":["email"]}', '{"full_name":"Teste sem Pump"}', now(), now(), false, false,
          '', '', '', '', '', '', '', '');
  insert into public.test_accounts (user_id, kind, label) values (v, 'no_pump', 'Sem conta da Pump (AM.PASS)');
  -- os gatilhos de cadastro criam aviso de conta nova e teste grátis: não valem para a conta de teste
  delete from public.notifications where kind = 'admin_new_user' and ref = v::text;
  delete from public.subscriptions where user_id = v;
end $$;

create or replace function public.admin_test_accounts()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not has_admin_perm('view_as', auth.uid()) then raise exception 'sem permissão para isso' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', user_id, 'kind', kind, 'label', label) order by created_at) from test_accounts), '[]'::jsonb);
end $$;
grant execute on function public.admin_test_accounts() to authenticated;

create or replace function public.admin_stats()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_guard('stats');
  return jsonb_build_object(
    'users', (select count(*) from auth.users u where not exists (select 1 from test_accounts x where x.user_id = u.id)),
    'new_7d', (select count(*) from auth.users u where created_at > now() - interval '7 days' and not exists (select 1 from test_accounts x where x.user_id = u.id)),
    'active_7d', (select count(*) from auth.users u where last_sign_in_at > now() - interval '7 days' and not exists (select 1 from test_accounts x where x.user_id = u.id)),
    'online', (select count(*) from user_presence where last_seen > now() - interval '3 minutes'),
    'linked', (select count(*) from piu_accounts),
    'plus', (select count(*) from subscriptions where plan = 'plus' and (expires_at is null or expires_at > now())),
    'pro', (select count(*) from subscriptions where plan = 'pro' and (expires_at is null or expires_at > now())),
    'feedback_open', (select count(*) from feedback where status = 'open'),
    'reports_open', (select count(*) from user_reports where status = 'open'),
    'banned', (select count(*) from auth.users where banned_until > now()));
end $function$;

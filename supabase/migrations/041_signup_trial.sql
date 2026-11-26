-- Teste grátis: toda conta nova ganha o Plus por 15 dias (configurável pelo admin); depois volta para o grátis.
alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check check (source in ('store', 'comp', 'lifetime', 'trial'));

update public.app_settings set value = value || jsonb_build_object('trial_days', 15, 'trial_plan', 'plus')
 where key = 'plans' and not (value ? 'trial_days');

-- e-mails que já usaram o teste (só o hash), para não ganhar de novo ao apagar e recriar a conta
create table if not exists public.trial_claims (
  email_hash text primary key,
  claimed_at timestamptz not null default now()
);
alter table public.trial_claims enable row level security;
revoke all on public.trial_claims from anon, authenticated;

create or replace function public.grant_signup_trial()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := app_config();
  v_days int := coalesce(nullif(cfg->>'trial_days', '')::int, 15);
  v_plan text := coalesce(nullif(cfg->>'trial_plan', ''), 'plus');
  v_hash text;
begin
  if v_days <= 0 or v_plan not in ('plus', 'pro') then return new; end if;
  if new.email is not null then
    v_hash := encode(extensions.digest(lower(trim(new.email)), 'sha256'), 'hex');
    insert into trial_claims (email_hash) values (v_hash) on conflict do nothing;
    if not found then return new; end if; -- esse e-mail já teve o teste
  end if;
  insert into subscriptions (user_id, plan, source, expires_at, note)
  values (new.id, v_plan, 'trial', now() + make_interval(days => least(v_days, 365)), 'teste grátis de cadastro')
  on conflict (user_id) do nothing;
  return new;
exception when others then
  return new; -- nunca impede o cadastro
end $$;
revoke all on function public.grant_signup_trial() from public, anon, authenticated;

drop trigger if exists on_signup_trial on auth.users;
create trigger on_signup_trial after insert on auth.users
  for each row execute function public.grant_signup_trial();

-- quem já tinha conta antes do teste não ganha o teste se recriar a conta
insert into public.trial_claims (email_hash)
select encode(extensions.digest(lower(trim(email)), 'sha256'), 'hex') from auth.users where email is not null
on conflict do nothing;

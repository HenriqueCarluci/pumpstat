-- Aviso no aparelho (Web Push) quando a pessoa é a próxima e quando chega a vez dela na fila. Opcional: só quem ativar.
create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete cascade,
  device_hash text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_device on public.push_subscriptions (device_hash);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- 0 nada avisado, 1 avisado "você é o próximo", 2 avisado "é a sua vez"
alter table public.queue_entries add column if not exists push_stage smallint not null default 0;

create or replace function public.push_public_key()
 returns text language sql stable security definer set search_path to 'public'
as $$ select value from app_secrets where name = 'vapid_public' $$;
grant execute on function public.push_public_key() to anon, authenticated;

-- o servidor gera as chaves VAPID na primeira vez; depois só lê
create or replace function public.push_vapid(p_key text, p_public text default null, p_private text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  if p_public is not null and p_private is not null and not exists (select 1 from app_secrets where name = 'vapid_private') then
    insert into app_secrets (name, value) values ('vapid_public', p_public), ('vapid_private', p_private)
    on conflict (name) do nothing;
  end if;
  return jsonb_build_object('public', (select value from app_secrets where name = 'vapid_public'),
                            'private', (select value from app_secrets where name = 'vapid_private'));
end $$;
revoke all on function public.push_vapid(text, text, text) from public, anon, authenticated;
grant execute on function public.push_vapid(text, text, text) to anon;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_token text default null)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_hash text := case when coalesce(p_token, '') <> '' then q_hash(p_token) end;
begin
  if auth.uid() is null and v_hash is null then raise exception 'aparelho sem identificação'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'inscrição inválida';
  end if;
  insert into push_subscriptions (user_id, device_hash, endpoint, p256dh, auth)
  values (auth.uid(), v_hash, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = coalesce(excluded.user_id, push_subscriptions.user_id),
    device_hash = coalesce(excluded.device_hash, push_subscriptions.device_hash), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
grant execute on function public.push_subscribe(text, text, text, text) to anon, authenticated;

create or replace function public.push_unsubscribe(p_endpoint text)
 returns void language sql security definer set search_path to 'public'
as $$ delete from push_subscriptions where endpoint = p_endpoint $$;
grant execute on function public.push_unsubscribe(text) to anon, authenticated;

create or replace function public.push_drop(p_key text, p_endpoint text)
 returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  delete from push_subscriptions where endpoint = p_endpoint;
end $$;
revoke all on function public.push_drop(text, text) from public, anon, authenticated;
grant execute on function public.push_drop(text, text) to anon;

-- quem precisa ser avisado agora: 1º da fila (sua vez) e 2º (próximo). Marca como avisado e devolve as inscrições.
create or replace function public.queue_push_due(p_key text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare out jsonb := '[]'::jsonb; r record;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  perform set_config('pumpstat.push_tick', 'off', true);
  -- quem passou a vez e voltou para o fim da fila pode ser avisado de novo na próxima rodada
  update queue_entries e set push_stage = 0
    from (select id, row_number() over (partition by machine_id order by pos) - 1 as rk
            from queue_entries where status = 'waiting') k
   where k.id = e.id and k.rk > 1 and e.push_stage > 0;
  for r in
    with ranked as (
      select e.*, row_number() over (partition by e.machine_id order by e.pos) - 1 as rk
        from queue_entries e where e.status = 'waiting'
    )
    select k.id, k.machine_id, k.user_id, k.guest_of, k.is_guest, k.display_name, k.rk,
           case when k.rk = 0 then 2 else 1 end as stage, m.name as machine, v.name as venue, v.slug
      from ranked k join machines m on m.id = k.machine_id join venues v on v.id = m.venue_id
     where k.rk <= 1 and k.push_stage < case when k.rk = 0 then 2 else 1 end
  loop
    update queue_entries set push_stage = r.stage where id = r.id;
    out := out || coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
               'title', case when r.stage = 2 then case when r.is_guest then 'Vez do seu convidado ' || r.display_name else 'É a sua vez!' end
                             else case when r.is_guest then r.display_name || ' é o próximo' else 'Você é o próximo' end end,
               'body', r.venue || ' · ' || r.machine,
               'url', '/#/fila/' || r.slug))
        from push_subscriptions s
       where (r.user_id is not null and s.user_id = r.user_id)
          or (r.guest_of is not null and s.user_id = r.guest_of)
          or exists (select 1 from queue_owners o where o.entry_id = r.id and o.device_hash = s.device_hash)), '[]'::jsonb);
  end loop;
  return out;
end $$;
revoke all on function public.queue_push_due(text) from public, anon, authenticated;
grant execute on function public.queue_push_due(text) to anon;

-- a fila mudou: acorda o servidor para mandar os avisos (sem segredo no pedido; o servidor confere tudo com a chave dele)
create or replace function public.tg_queue_push_tick()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if coalesce(current_setting('pumpstat.push_tick', true), '') = 'off' then return null; end if;
  if exists (select 1 from push_subscriptions limit 1) then
    perform net.http_post(url := 'https://pumpstat-api.onrender.com/api/push/queue-tick',
      headers := jsonb_build_object('Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 5000);
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists queue_push_tick on public.queue_entries;
create trigger queue_push_tick after insert or delete or update of pos, status on public.queue_entries
  for each statement execute function public.tg_queue_push_tick();

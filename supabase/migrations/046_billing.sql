-- 046: cobrança das assinaturas (Google Play via RevenueCat).
-- O RevenueCat avisa o servidor (webhook) a cada compra, renovação, cancelamento ou expiração;
-- o servidor chama billing_event com a chave de ingestão, e aqui o plano do usuário é atualizado.
alter table public.subscriptions add column if not exists product text check (length(product) <= 120);
alter table public.subscriptions add column if not exists will_renew boolean;

create table if not exists public.billing_events (
  id         bigint generated always as identity primary key,
  event_id   text unique check (length(event_id) <= 120),
  user_id    uuid references auth.users(id) on delete set null,
  type       text not null check (length(type) <= 40),
  product    text check (length(product) <= 120),
  expires_at timestamptz,
  payload    jsonb,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

create or replace function public.billing_event(p_key text, p_event_id text, p_user uuid, p_type text, p_product text,
  p_expires timestamptz, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan text; v_new boolean;
begin
  if p_key is null or p_key <> (select value from app_secrets where name = 'ingest_key') then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  if p_event_id is not null and exists (select 1 from billing_events where event_id = p_event_id) then
    return jsonb_build_object('duplicate', true);
  end if;
  v_new := p_user is not null and exists (select 1 from auth.users where id = p_user);
  insert into billing_events (event_id, user_id, type, product, expires_at, payload)
  values (left(p_event_id, 120), case when v_new then p_user end, left(coalesce(p_type, '?'), 40), left(p_product, 120), p_expires, p_payload);
  if not v_new then return jsonb_build_object('ignored', 'usuário desconhecido'); end if;

  v_plan := case when p_product ilike '%pro%' then 'pro' when p_product ilike '%plus%' then 'plus' end;

  if p_type in ('INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED', 'NON_RENEWING_PURCHASE')
     and v_plan is not null then
    insert into subscriptions (user_id, plan, source, expires_at, product, will_renew, note, updated_at)
    values (p_user, v_plan, 'store', p_expires, p_product, p_type <> 'NON_RENEWING_PURCHASE', 'Google Play', now())
    on conflict (user_id) do update set plan = excluded.plan, source = 'store', expires_at = excluded.expires_at,
      product = excluded.product, will_renew = excluded.will_renew, note = excluded.note, updated_at = now();
  elsif p_type = 'CANCELLATION' then
    -- cancelou a renovação: continua com o plano até o fim do período pago
    update subscriptions set will_renew = false, updated_at = now() where user_id = p_user and source = 'store';
  elsif p_type = 'EXPIRATION' then
    update subscriptions set expires_at = least(coalesce(expires_at, now()), now()), will_renew = false, updated_at = now()
     where user_id = p_user and source = 'store';
  end if;
  return jsonb_build_object('ok', true, 'plan', v_plan);
end $$;
revoke all on function public.billing_event(text, text, uuid, text, text, timestamptz, jsonb) from public;
grant execute on function public.billing_event(text, text, uuid, text, text, timestamptz, jsonb) to anon, authenticated;

-- plano do usuário logado, agora com o produto e a renovação
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', plan_of(auth.uid()), 'source', s.source, 'expires_at', s.expires_at,
    'product', s.product, 'will_renew', s.will_renew,
    'admin', is_app_admin(auth.uid()), 'config', app_config(),
    'friends', (select count(*) from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me and (s.expires_at is null or s.expires_at > now())
   where auth.uid() is not null
$$;

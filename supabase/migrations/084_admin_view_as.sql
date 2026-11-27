-- 084: "Ver como usuário" (só leitura) para o dono e o admin geral.
-- Enquanto a sessão está ativa, o PostgREST troca o usuário do pedido (auth.uid()) pelo usuário escolhido
-- no gancho db_pre_request, e só deixa passar leituras: GET/HEAD nas tabelas e funções STABLE/IMMUTABLE.
-- Conversas e notificações (que mostram trechos de mensagens) ficam bloqueadas. Tudo fica registrado.

create table if not exists public.admin_view_as (
  admin_id uuid primary key references auth.users on delete cascade,
  target_id uuid not null references auth.users on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.admin_view_as enable row level security;

create table if not exists public.admin_view_as_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  target_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.admin_view_as_log enable row level security;

-- gancho que roda antes de cada pedido da API
create or replace function public.check_request()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_claims jsonb;
  v_sub uuid;
  v_target uuid;
  v_method text;
  v_path text;
  v_fn text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_sub := nullif(v_claims->>'sub', '')::uuid;
  exception when others then
    return;
  end;
  if v_sub is null then return; end if;
  select a.target_id into v_target from admin_view_as a where a.admin_id = v_sub and a.expires_at > now();
  if v_target is null then return; end if;

  v_method := upper(coalesce(current_setting('request.method', true), 'GET'));
  v_path := coalesce(current_setting('request.path', true), '');
  v_fn := case when v_path like '/rpc/%' then split_part(substr(v_path, 6), '?', 1) end;

  -- sair do modo continua valendo como o próprio admin
  if v_fn = 'admin_stop_view_as' then return; end if;

  if v_fn is not null then
    if v_fn in ('chat_with', 'my_notifications') then
      raise exception 'modo somente leitura: conversas e notificações da pessoa ficam ocultas' using errcode = '42501';
    end if;
    if v_fn not in ('tier_proposals_list') and exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = v_fn and p.provolatile = 'v') then
      raise exception 'modo somente leitura' using errcode = '42501';
    end if;
  elsif v_method not in ('GET', 'HEAD') then
    raise exception 'modo somente leitura' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claims', jsonb_set(v_claims, '{sub}', to_jsonb(v_target::text))::text, true);
  perform set_config('request.jwt.claim.sub', v_target::text, true);
  perform set_config('app.view_as_admin', v_sub::text, true);
end $$;
revoke all on function public.check_request() from public, anon;
grant execute on function public.check_request() to authenticated, anon, authenticator;

create or replace function public.admin_start_view_as(p_user uuid, p_minutes int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_exp timestamptz;
begin
  if coalesce(admin_role(me), '') not in ('owner', 'admin') then raise exception 'sem permissão para isso' using errcode = '42501'; end if;
  if p_user = me then raise exception 'escolha outra pessoa'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'usuário não encontrado'; end if;
  if admin_role(p_user) = 'owner' then raise exception 'não dá para ver como o dono do app'; end if;
  v_exp := now() + make_interval(mins => least(greatest(coalesce(p_minutes, 30), 5), 120));
  insert into admin_view_as (admin_id, target_id, expires_at) values (me, p_user, v_exp)
  on conflict (admin_id) do update set target_id = excluded.target_id, started_at = now(), expires_at = excluded.expires_at;
  update admin_view_as_log set ended_at = now() where admin_id = me and ended_at is null;
  insert into admin_view_as_log (admin_id, target_id) values (me, p_user);
  return jsonb_build_object('target', p_user, 'expires_at', v_exp);
end $$;
revoke all on function public.admin_start_view_as(uuid, int) from public, anon;
grant execute on function public.admin_start_view_as(uuid, int) to authenticated;

-- roda como o admin de verdade (o gancho deixa passar sem trocar o usuário)
create or replace function public.admin_stop_view_as()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  delete from admin_view_as where admin_id = me;
  update admin_view_as_log set ended_at = now() where admin_id = me and ended_at is null;
end $$;
revoke all on function public.admin_stop_view_as() from public, anon;
grant execute on function public.admin_stop_view_as() to authenticated;

-- my_plan informa a sessão de "ver como" (para a faixa no topo do app)
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', plan_of(auth.uid()), 'source', s.source, 'expires_at', s.expires_at,
    'product', s.product, 'will_renew', s.will_renew,
    'admin', is_app_admin(auth.uid()), 'admin_role', admin_role(auth.uid()),
    'perms', to_jsonb(admin_perms(admin_role(auth.uid()))), 'config', app_config(),
    'tour_seen', coalesce((select us.tour_seen from user_settings us where us.user_id = auth.uid()), false),
    'friends', (select count(*) from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)),
    'preview', (select jsonb_build_object('plan', p.plan, 'expires_at', p.expires_at) from admin_plan_preview p
                 where p.user_id = auth.uid() and p.expires_at > now() and coalesce(is_app_admin(auth.uid()), false)),
    'grants', coalesce((select jsonb_agg(g.feature) from user_feature_grants g
                         where g.user_id = auth.uid() and (g.expires_at is null or g.expires_at > now())), '[]'::jsonb),
    'view_as', (select jsonb_build_object('admin', v.admin_id, 'target', v.target_id, 'expires_at', v.expires_at,
                         'email', (select u.email from auth.users u where u.id = v.target_id))
                  from admin_view_as v
                 where v.admin_id = nullif(current_setting('app.view_as_admin', true), '')::uuid and v.expires_at > now()))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me and (s.expires_at is null or s.expires_at > now())
   where auth.uid() is not null
$$;

alter role authenticator set pgrst.db_pre_request = 'public.check_request';
notify pgrst, 'reload config';

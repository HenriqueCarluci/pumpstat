-- 128: login AM.PASS guardado criptografado para atualizar as notas quando a sessão do piugame expirar.
-- O blob vem cifrado pela API (AES-256-GCM, chave só no servidor do Render); o banco nunca vê a senha em texto.
-- Ninguém lê a tabela pelo app (RLS sem políticas); só a API, com a chave do servidor. Sai ao desconectar a Pump,
-- ao excluir a conta (cascade), quando a pessoa pede para esquecer ou quando o login falha (senha trocada).
create table if not exists public.piu_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blob text not null check (length(blob) <= 4000),
  saved_at timestamptz not null default now()
);
alter table public.piu_credentials enable row level security;
revoke all on public.piu_credentials from public, anon, authenticated;

create or replace function public.save_piu_cred(p_blob text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into piu_credentials (user_id, blob) values (auth.uid(), p_blob)
  on conflict (user_id) do update set blob = excluded.blob, saved_at = now();
end $$;
revoke all on function public.save_piu_cred(text) from public, anon;
grant execute on function public.save_piu_cred(text) to authenticated;

create or replace function public.forget_piu_cred()
 returns void language sql security definer set search_path to 'public' as $$
  delete from piu_credentials where user_id = auth.uid()
$$;
revoke all on function public.forget_piu_cred() from public, anon;
grant execute on function public.forget_piu_cred() to authenticated;

create or replace function public.my_auto_sync()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('on', a.auto_sync, 'last', a.auto_sync_at, 'error', a.auto_sync_error,
           'has_session', exists (select 1 from piu_sessions s where s.user_id = a.user_id)
                          or exists (select 1 from piu_credentials c where c.user_id = a.user_id),
           'has_cred', exists (select 1 from piu_credentials c where c.user_id = a.user_id))
    from piu_accounts a where a.user_id = auth.uid()
$$;
revoke all on function public.my_auto_sync() from public, anon;
grant execute on function public.my_auto_sync() to authenticated;

-- servidor: login falhou (senha trocada) → apaga; sessão nova depois do login → grava
create or replace function public.piu_cred_drop(p_key text, p_user uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  delete from piu_credentials where user_id = p_user;
end $$;
revoke all on function public.piu_cred_drop(text, uuid) from public;
grant execute on function public.piu_cred_drop(text, uuid) to anon, authenticated;

create or replace function public.piu_session_store(p_key text, p_user uuid, p_blob text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  insert into piu_sessions (user_id, blob) values (p_user, p_blob)
  on conflict (user_id) do update set blob = excluded.blob, saved_at = now();
end $$;
revoke all on function public.piu_session_store(text, uuid, text) from public;
grant execute on function public.piu_session_store(text, uuid, text) to anon, authenticated;

-- desconectou a Pump: o login guardado sai junto
create or replace function public.piu_cred_on_unlink() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.game_id is null and old.game_id is not null then delete from piu_credentials where user_id = new.user_id; end if;
  return new;
end $$;
drop trigger if exists piu_cred_on_unlink on public.piu_accounts;
create trigger piu_cred_on_unlink after update of game_id on public.piu_accounts for each row execute function public.piu_cred_on_unlink();

-- sincronização automática: quem tem sessão OU login guardado
create or replace function public.auto_sync_candidates(p_key text, p_limit int default 5, p_hours int default 6)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare need text; enf boolean;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  enf := coalesce((app_config()->>'enforce')::boolean, false);
  need := coalesce(app_config()->'features'->>'auto_sync', 'pro');
  return (select coalesce(jsonb_agg(jsonb_build_object('user', a.user_id, 'blob', s.blob, 'cred', c.blob, 'last_sync', a.last_sync_at)), '[]')
    from (select a.* from piu_accounts a
            join auth.users u on u.id = a.user_id
           where a.auto_sync
             and (exists (select 1 from piu_sessions s2 where s2.user_id = a.user_id) or exists (select 1 from piu_credentials c2 where c2.user_id = a.user_id))
             and (u.banned_until is null or u.banned_until < now())
             and greatest(u.last_sign_in_at, (select last_seen from user_presence p where p.user_id = a.user_id)) > now() - interval '21 days'
             and coalesce(a.last_sync_at, 'epoch') < now() - make_interval(hours => p_hours)
             and coalesce(a.auto_sync_at, 'epoch') < now() - interval '1 hour'
             and (not enf or is_app_admin(a.user_id)
                  or array_position(array['free', 'plus', 'pro'], plan_of(a.user_id)) >= array_position(array['free', 'plus', 'pro'], need))
           order by a.last_sync_at nulls first
           limit least(greatest(p_limit, 1), 20)) a
    left join piu_sessions s on s.user_id = a.user_id
    left join piu_credentials c on c.user_id = a.user_id);
end $$;
revoke all on function public.auto_sync_candidates(text, int, int) from public;
grant execute on function public.auto_sync_candidates(text, int, int) to anon, authenticated;

-- Admin → Atualizar notas: conta como "dá para atualizar" quem tem sessão OU login guardado
create or replace function public.admin_sync_list()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth' as $$
begin
  perform admin_guard('users');
  return (select coalesce(jsonb_agg(x order by x->>'nickname'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', a.user_id,
      'nickname', coalesce((select nickname from user_profiles p where p.user_id = a.user_id and nickname is not null order by taken_at desc limit 1), account_label(a.user_id)),
      'last_sync', a.last_sync_at, 'auto', a.auto_sync, 'auto_error', a.auto_sync_error,
      'has_session', exists (select 1 from piu_sessions s where s.user_id = a.user_id) or exists (select 1 from piu_credentials c where c.user_id = a.user_id),
      'req', (select jsonb_build_object('status', r.status, 'at', r.requested_at, 'finished', r.finished_at, 'error', r.error)
                from admin_sync_requests r where r.user_id = a.user_id order by r.id desc limit 1)) x
      from piu_accounts a join auth.users u on u.id = a.user_id
     where a.game_id is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())) q);
end $$;

create or replace function public.admin_sync_request(p_users uuid[] default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'auth' as $$
declare v_q int; v_skip int;
begin
  perform admin_guard('users');
  with alvo as (
    select a.user_id, (exists (select 1 from piu_sessions s where s.user_id = a.user_id)
                       or exists (select 1 from piu_credentials c where c.user_id = a.user_id)) as ok
      from piu_accounts a join auth.users u on u.id = a.user_id
     where a.game_id is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())
       and (p_users is null or a.user_id = any (p_users))
  ), ins as (
    insert into admin_sync_requests (user_id, requested_by)
    select user_id, auth.uid() from alvo
     where ok and not exists (select 1 from admin_sync_requests r where r.user_id = alvo.user_id and r.status in ('queued', 'running'))
    returning 1
  )
  select (select count(*) from ins), (select count(*) from alvo where not ok) into v_q, v_skip;
  insert into admin_actions_log (admin_id, action, target) values (auth.uid(), 'sync_request:' || v_q, null);
  return jsonb_build_object('queued', v_q, 'no_session', v_skip);
end $$;

create or replace function public.admin_sync_take(p_key text, p_limit int default 3)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare res jsonb;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  update admin_sync_requests set status = 'queued', started_at = null where status = 'running' and started_at < now() - interval '20 minutes';
  with nxt as (
    select r.id from admin_sync_requests r where r.status = 'queued' order by r.requested_at, r.id
     limit least(greatest(p_limit, 1), 10) for update skip locked
  ), upd as (
    update admin_sync_requests r set status = 'running', started_at = now() from nxt where r.id = nxt.id returning r.id, r.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', upd.id, 'user', upd.user_id, 'blob', s.blob, 'cred', c.blob)), '[]'::jsonb) into res
    from upd left join piu_sessions s on s.user_id = upd.user_id left join piu_credentials c on c.user_id = upd.user_id;
  return res;
end $$;

-- a API busca o login guardado (cifrado) para entrar de novo quando a sessão expirou
create or replace function public.piu_cred_get(p_key text, p_user uuid)
 returns text language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  return (select blob from piu_credentials where user_id = p_user);
end $$;
revoke all on function public.piu_cred_get(text, uuid) from public;
grant execute on function public.piu_cred_get(text, uuid) to anon, authenticated;

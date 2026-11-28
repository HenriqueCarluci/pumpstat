-- 124: Admin → Atualizar notas. O admin pede a atualização das notas de todos ou de quem escolher; o servidor
-- usa a sessão do piugame que a pessoa já deixou salva (a mesma da sincronização automática) e grava as notas.
-- Quem não tem sessão salva fica de fora (precisa sincronizar uma vez com a senha AM.PASS). Tudo registrado.
create table if not exists public.admin_sync_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  started_at timestamptz,
  finished_at timestamptz,
  error text check (error is null or length(error) <= 300)
);
create index if not exists admin_sync_requests_queue on public.admin_sync_requests (status, requested_at);
alter table public.admin_sync_requests enable row level security;
revoke all on public.admin_sync_requests from public, anon, authenticated;

-- quem dá para atualizar: contas com Pump conectada; has_session diz se o servidor consegue sozinho
create or replace function public.admin_sync_list()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth' as $$
begin
  perform admin_guard('users');
  return (select coalesce(jsonb_agg(x order by x->>'nickname'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', a.user_id,
      'nickname', coalesce((select nickname from user_profiles p where p.user_id = a.user_id and nickname is not null order by taken_at desc limit 1), account_label(a.user_id)),
      'last_sync', a.last_sync_at, 'auto', a.auto_sync, 'auto_error', a.auto_sync_error,
      'has_session', exists (select 1 from piu_sessions s where s.user_id = a.user_id),
      'req', (select jsonb_build_object('status', r.status, 'at', r.requested_at, 'finished', r.finished_at, 'error', r.error)
                from admin_sync_requests r where r.user_id = a.user_id order by r.id desc limit 1)) x
      from piu_accounts a join auth.users u on u.id = a.user_id
     where a.game_id is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())) q);
end $$;
revoke all on function public.admin_sync_list() from public, anon;
grant execute on function public.admin_sync_list() to authenticated;

-- pede a atualização (p_users null = todos com sessão salva); não duplica quem já está na fila
create or replace function public.admin_sync_request(p_users uuid[] default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'auth' as $$
declare v_q int; v_skip int;
begin
  perform admin_guard('users');
  with alvo as (
    select a.user_id, exists (select 1 from piu_sessions s where s.user_id = a.user_id) as ok
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
revoke all on function public.admin_sync_request(uuid[]) from public, anon;
grant execute on function public.admin_sync_request(uuid[]) to authenticated;

-- servidor: pega os próximos da fila (com a sessão) e marca como em andamento
create or replace function public.admin_sync_take(p_key text, p_limit int default 3)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare res jsonb;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  -- pedido travado há mais de 20 min volta para a fila
  update admin_sync_requests set status = 'queued', started_at = null where status = 'running' and started_at < now() - interval '20 minutes';
  with nxt as (
    select r.id from admin_sync_requests r where r.status = 'queued' order by r.requested_at, r.id
     limit least(greatest(p_limit, 1), 10) for update skip locked
  ), upd as (
    update admin_sync_requests r set status = 'running', started_at = now() from nxt where r.id = nxt.id returning r.id, r.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', upd.id, 'user', upd.user_id, 'blob', s.blob)), '[]'::jsonb) into res
    from upd left join piu_sessions s on s.user_id = upd.user_id;
  return res;
end $$;
revoke all on function public.admin_sync_take(text, int) from public;
grant execute on function public.admin_sync_take(text, int) to anon, authenticated;

create or replace function public.admin_sync_finish(p_key text, p_id bigint, p_error text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  update admin_sync_requests set status = case when p_error is null then 'done' else 'error' end,
         finished_at = now(), error = left(p_error, 300) where id = p_id;
end $$;
revoke all on function public.admin_sync_finish(text, bigint, text) from public;
grant execute on function public.admin_sync_finish(text, bigint, text) to anon, authenticated;

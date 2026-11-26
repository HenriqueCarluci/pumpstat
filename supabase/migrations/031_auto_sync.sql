-- 031: sincronização automática feita pela API com a sessão salva (chave de ingestão do servidor)
alter table public.piu_accounts add column if not exists auto_sync boolean not null default true;
alter table public.piu_accounts add column if not exists auto_sync_error text;
alter table public.piu_accounts add column if not exists auto_sync_at timestamptz;

create or replace function public.server_key_ok(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_key is not null and p_key = (select value from app_secrets where name = 'ingest_key')
$$;
revoke all on function public.server_key_ok(text) from public, anon, authenticated;

-- quem deve ser sincronizado agora: tem sessão salva, auto ligado, conta ativa nos últimos 21 dias,
-- última sincronização há mais de p_hours horas; com cobrança ativa, só quem tem o recurso auto_sync no plano
create or replace function public.auto_sync_candidates(p_key text, p_limit int default 5, p_hours int default 6)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare need text; enf boolean;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  enf := coalesce((app_config()->>'enforce')::boolean, false);
  need := coalesce(app_config()->'features'->>'auto_sync', 'pro');
  return (select coalesce(jsonb_agg(jsonb_build_object('user', a.user_id, 'blob', s.blob, 'last_sync', a.last_sync_at)), '[]')
    from (select a.* from piu_accounts a
            join piu_sessions s2 on s2.user_id = a.user_id
            join auth.users u on u.id = a.user_id
           where a.auto_sync
             and (u.banned_until is null or u.banned_until < now())
             and greatest(u.last_sign_in_at, (select last_seen from user_presence p where p.user_id = a.user_id)) > now() - interval '21 days'
             and coalesce(a.last_sync_at, 'epoch') < now() - make_interval(hours => p_hours)
             and coalesce(a.auto_sync_at, 'epoch') < now() - interval '1 hour'
             and (not enf or is_app_admin(a.user_id)
                  or array_position(array['free', 'plus', 'pro'], plan_of(a.user_id)) >= array_position(array['free', 'plus', 'pro'], need))
           order by a.last_sync_at nulls first
           limit least(greatest(p_limit, 1), 20)) a
    join piu_sessions s on s.user_id = a.user_id);
end $$;
revoke all on function public.auto_sync_candidates(text, int, int) from public;
grant execute on function public.auto_sync_candidates(text, int, int) to anon, authenticated;

create or replace function public.ingest_auto(p_key text, p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  return ingest_for(p_user, p_payload, 'server');
end $$;
revoke all on function public.ingest_auto(text, uuid, jsonb) from public;
grant execute on function public.ingest_auto(text, uuid, jsonb) to anon, authenticated;

create or replace function public.ingest_titles_auto(p_key text, p_user uuid, p_version text, p_titles jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  if p_version not in ('phoenix', 'phoenix2') then raise exception 'versão inválida'; end if;
  delete from user_titles where user_id = p_user and version = p_version;
  insert into user_titles (user_id, version, name, owned, color, condition, cur, target, ord)
  select p_user, p_version, t->>'name', coalesce((t->>'owned')::boolean, false), nullif(t->>'color', '')::int,
         nullif(t->>'condition', ''), nullif(t->>'cur', '')::numeric, nullif(t->>'target', '')::numeric, ord::int
    from jsonb_array_elements(p_titles) with ordinality as x(t, ord)
   where coalesce(t->>'name', '') <> ''
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ingest_titles_auto(text, uuid, text, jsonb) from public;
grant execute on function public.ingest_titles_auto(text, uuid, text, jsonb) to anon, authenticated;

-- resultado de uma tentativa automática (sessão nova ou erro)
create or replace function public.auto_sync_done(p_key text, p_user uuid, p_blob text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  update piu_accounts set auto_sync_at = now(), auto_sync_error = left(p_error, 300) where user_id = p_user;
  if p_blob is not null then
    update piu_sessions set blob = p_blob, saved_at = now() where user_id = p_user;
  end if;
  -- sessão expirada: apaga para não tentar de novo; a pessoa entra com a senha na próxima vez
  if p_error = 'session_expired' then delete from piu_sessions where user_id = p_user; end if;
end $$;
revoke all on function public.auto_sync_done(text, uuid, text, text) from public;
grant execute on function public.auto_sync_done(text, uuid, text, text) to anon, authenticated;

-- o usuário liga/desliga a sincronização automática
create or replace function public.set_auto_sync(p_on boolean)
returns void language sql security definer set search_path = public as $$
  update piu_accounts set auto_sync = p_on where user_id = auth.uid();
$$;
revoke all on function public.set_auto_sync(boolean) from public, anon;
grant execute on function public.set_auto_sync(boolean) to authenticated;

create or replace function public.my_auto_sync()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('on', a.auto_sync, 'last', a.auto_sync_at, 'error', a.auto_sync_error,
           'has_session', exists (select 1 from piu_sessions s where s.user_id = a.user_id))
    from piu_accounts a where a.user_id = auth.uid()
$$;
revoke all on function public.my_auto_sync() from public, anon;
grant execute on function public.my_auto_sync() to authenticated;

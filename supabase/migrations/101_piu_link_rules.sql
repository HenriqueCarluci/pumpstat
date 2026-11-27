-- Vínculo com o AM.PASS: a conta do app é a dona; um ID de jogo só fica em uma conta do app;
-- trocar de ID numa conta que já tem notas pergunta se é o mesmo jogador (mudou o nick) ou outro (apaga as notas antigas).
-- Só o servidor (que acabou de entrar no piugame com a conta) confere e resolve, com a chave dele.

create or replace function public.norm_game_id(p text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')), '')
$$;

-- apaga só os dados importados da Pump (amigos, time, ajustes, plano etc. continuam)
create or replace function public.wipe_game_data(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from user_scores where user_id = p_user;
  delete from user_plays where user_id = p_user;
  delete from user_score_history where user_id = p_user;
  delete from user_profiles where user_id = p_user;
  delete from user_titles where user_id = p_user;
end $$;
revoke all on function public.wipe_game_data(uuid) from public, anon, authenticated;

create or replace function public.piu_current_game_id(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select game_id from piu_accounts where user_id = p_user),
                  (select nickname from user_profiles where user_id = p_user order by taken_at desc limit 1))
$$;
revoke all on function public.piu_current_game_id(uuid) from public, anon, authenticated;

create or replace function public.piu_link_check(p_key text, p_user uuid, p_game_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g text := norm_game_id(p_game_id); cur text; has_data boolean;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  if g is null then return jsonb_build_object('taken', false, 'changed', false); end if;
  cur := piu_current_game_id(p_user);
  has_data := exists (select 1 from user_scores where user_id = p_user) or exists (select 1 from user_plays where user_id = p_user);
  return jsonb_build_object(
    'taken', exists (select 1 from piu_accounts where user_id <> p_user and norm_game_id(game_id) = g),
    'changed', has_data and cur is not null and norm_game_id(cur) <> g,
    'current', cur);
end $$;
revoke all on function public.piu_link_check(text, uuid, text) from public;
grant execute on function public.piu_link_check(text, uuid, text) to anon, authenticated;

-- p_mode: 'same' (mesmo jogador, mudou o nick) | 'other' (outro jogador: apaga as notas antigas desta conta) | null (sem troca)
-- p_move: tira o ID de jogo das outras contas do app (elas perdem as notas importadas e a sessão do piugame)
create or replace function public.piu_link_resolve(p_key text, p_user uuid, p_game_id text, p_mode text, p_move boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g text := norm_game_id(p_game_id); o uuid;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  if g is null then return; end if;
  if p_move then
    for o in select user_id from piu_accounts where user_id <> p_user and norm_game_id(game_id) = g loop
      perform wipe_game_data(o);
      delete from piu_sessions where user_id = o;
      update piu_accounts set game_id = null, auto_sync = false, last_sync_at = null where user_id = o;
      perform notify(o, 'piu_link_moved', p_user, null, jsonb_build_object('game_id', p_game_id));
    end loop;
  end if;
  if p_mode = 'other' then perform wipe_game_data(p_user); end if;
  insert into piu_accounts (user_id, game_id) values (p_user, p_game_id)
  on conflict (user_id) do update set game_id = excluded.game_id;
end $$;
revoke all on function public.piu_link_resolve(text, uuid, text, text, boolean) from public;
grant execute on function public.piu_link_resolve(text, uuid, text, text, boolean) to anon, authenticated;

-- painel: IDs de jogo em mais de uma conta do app e contas com mais de um nick no histórico
create or replace function public.admin_piu_link_issues()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('users');
  return jsonb_build_object(
    'shared', coalesce((
      select jsonb_agg(jsonb_build_object('game_id', x.game_id, 'accounts', x.accounts) order by x.game_id)
        from (select min(a.game_id) as game_id,
                     jsonb_agg(jsonb_build_object('user', a.user_id, 'email', u.email, 'last_sync', a.last_sync_at,
                                                  'scores', (select count(*) from user_scores s where s.user_id = a.user_id))
                               order by a.last_sync_at desc nulls last) as accounts
                from piu_accounts a join auth.users u on u.id = a.user_id
               where a.game_id is not null
               group by norm_game_id(a.game_id) having count(*) > 1) x), '[]'::jsonb),
    'multi', coalesce((
      select jsonb_agg(jsonb_build_object('user', y.user_id, 'email', u.email, 'nicks', y.nicks, 'current', piu_current_game_id(y.user_id)))
        from (select p.user_id, jsonb_agg(distinct p.nickname) as nicks
                from user_profiles p where p.nickname is not null
               group by p.user_id having count(distinct norm_game_id(p.nickname)) > 1) y
        join auth.users u on u.id = y.user_id), '[]'::jsonb));
end $$;
revoke all on function public.admin_piu_link_issues() from public, anon;
grant execute on function public.admin_piu_link_issues() to authenticated;

-- painel: desvincula o AM.PASS de uma conta do app (e, se pedido, apaga as notas importadas dela)
create or replace function public.admin_unlink_piu(p_user uuid, p_wipe boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('users');
  if p_wipe then perform wipe_game_data(p_user); end if;
  delete from piu_sessions where user_id = p_user;
  update piu_accounts set game_id = null, auto_sync = false where user_id = p_user;
end $$;
revoke all on function public.admin_unlink_piu(uuid, boolean) from public, anon;
grant execute on function public.admin_unlink_piu(uuid, boolean) to authenticated;

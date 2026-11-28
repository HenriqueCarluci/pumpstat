-- 125: sessão do piugame sempre viva. O piugame derruba a sessão parada em poucas horas, e aí nem a sincronização
-- automática nem o "Atualizar notas" do admin conseguem entrar. O servidor passa a fazer um acesso leve (sem baixar
-- notas) a cada ~20 min com a sessão de cada pessoa, renovando os cookies. Se mesmo assim ela cair, a pessoa recebe
-- um aviso para sincronizar de novo com a senha (o PIU Stats não guarda senha).

-- sessões que precisam de um toque (paradas há mais de p_minutes)
create or replace function public.piu_sessions_stale(p_key text, p_minutes int default 15, p_limit int default 30)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth' as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user', s.user_id, 'blob', s.blob) order by s.saved_at), '[]'::jsonb)
    from (select s.* from piu_sessions s join auth.users u on u.id = s.user_id
           where s.saved_at < now() - make_interval(mins => greatest(p_minutes, 5))
             and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())
           order by s.saved_at limit least(greatest(p_limit, 1), 100)) s);
end $$;
revoke all on function public.piu_sessions_stale(text, int, int) from public;
grant execute on function public.piu_sessions_stale(text, int, int) to anon, authenticated;

create or replace function public.piu_session_touch(p_key text, p_user uuid, p_blob text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  update piu_sessions set blob = coalesce(p_blob, blob), saved_at = now() where user_id = p_user;
end $$;
revoke all on function public.piu_session_touch(text, uuid, text) from public;
grant execute on function public.piu_session_touch(text, uuid, text) to anon, authenticated;

-- sessão caiu: apaga e avisa a pessoa (no máximo um aviso por dia)
create or replace function public.auto_sync_done(p_key text, p_user uuid, p_blob text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare had boolean;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  update piu_accounts set auto_sync_at = now(), auto_sync_error = left(p_error, 300) where user_id = p_user;
  if p_blob is not null then
    update piu_sessions set blob = p_blob, saved_at = now() where user_id = p_user;
  end if;
  if p_error = 'session_expired' then
    delete from piu_sessions where user_id = p_user returning true into had;
    if coalesce(had, false) and not exists (select 1 from notifications n where n.user_id = p_user and n.kind = 'sync_expired'
                                              and n.created_at > now() - interval '1 day') then
      insert into notifications (user_id, kind, ref, payload) values (p_user, 'sync_expired', 'sync_expired:' || to_char(now(), 'YYYYMMDD'), '{}'::jsonb);
    end if;
  end if;
end $$;
revoke all on function public.auto_sync_done(text, uuid, text, text) from public;
grant execute on function public.auto_sync_done(text, uuid, text, text) to anon, authenticated;

create or replace function public.push_category(p_kind text)
 returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'chat'
    when p_kind = 'invite' then 'invites'
    when p_kind in ('friend_request', 'friend_accepted', 'friend_new') then 'friends'
    when p_kind in ('friend_live', 'friend_pumbility', 'friend_online') then 'friends_activity'
    when p_kind like 'team\_%' then 'team'
    when p_kind in ('app_update', 'feedback_reply', 'release_note', 'sync_expired') then 'app'
    when p_kind like 'admin\_%' then 'admin'
    when p_kind in ('challenge_new', 'challenge_won', 'badge', 'tier_vote_result', 'piu_link_moved')
      or p_kind like 'venue\_%' then 'other'
    else null end
$$;

create or replace function public.push_text(n notifications)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare who text; pic text; p jsonb := coalesce(n.payload, '{}'::jsonb); body text; url text := '/#/';
begin
  if n.actor is not null then
    select coalesce(nickname, 'Alguém'), avatar_url into who, pic from visible_profiles where user_id = n.actor order by taken_at desc limit 1;
    who := coalesce(who, account_label(n.actor), 'Alguém');
  end if;
  case n.kind
    when 'message' then body := who || ': ' || left(coalesce(p->>'message', 'nova mensagem'), 160); url := '/#/jogador/' || n.actor;
    when 'invite' then body := who || ' te chamou para jogar' || coalesce(': ' || left(p->>'message', 120), '');
      url := case when p->>'venue' is not null then '/#/fila/' || (p->>'venue') else '/#/online' end;
    when 'friend_request' then body := who || ' quer ser seu amigo'; url := '/#/jogadores?tab=requests';
    when 'friend_accepted' then body := who || ' aceitou seu pedido de amizade'; url := '/#/jogador/' || n.actor;
    when 'friend_new' then body := who || ' agora é seu amigo'; url := '/#/jogador/' || n.actor;
    when 'friend_live' then body := who || ' está ao vivo'; url := '/#/jogador/' || n.actor;
    when 'friend_pumbility' then body := who || ' subiu de PUMBILITY'; url := '/#/jogador/' || n.actor;
    when 'team_join_request' then body := 'Pedido para entrar no time ' || coalesce(p->>'name', ''); url := '/#/time';
    when 'team_join_approved' then body := 'Você entrou no time ' || coalesce(p->>'name', ''); url := '/#/time';
    when 'team_admin' then body := 'Você agora é admin do time ' || coalesce(p->>'name', ''); url := '/#/time';
    when 'app_update' then body := 'Versão nova do app para teste (' || coalesce(p->>'version', '') || '). Toque para atualizar.';
      url := coalesce(p->>'link', '/#/');
    when 'feedback_reply' then body := case p->>'status'
                                            when 'fixed' then 'Seu report #' || (p->>'id') || ' foi corrigido'
                                            when 'bug_approved' then 'Seu report #' || (p->>'id') || ' entrou na fila de correção'
                                            when 'approved' then 'Sua sugestão #' || (p->>'id') || ' foi aprovada para a próxima versão semanal'
                                            when 'implemented' then 'Sua sugestão #' || (p->>'id') || ' já está no app'
                                            when 'rejected' then 'Sobre sua sugestão #' || (p->>'id')
                                            when 'need_info' then 'Precisamos de mais detalhes sobre o seu chamado #' || (p->>'id')
                                            else 'Resposta ao seu chamado #' || (p->>'id') end
                                     || coalesce(': ' || left(p->>'reply', 140), ''); url := '/#/suporte?id=' || coalesce(p->>'id', '');
    when 'sync_expired' then body := 'Sua conexão com a Pump expirou. Sincronize de novo para as notas continuarem atualizando sozinhas.'; url := '/#/ajustes';
    when 'release_note' then body := 'Novidade no PIU Stats: ' || coalesce(p->>'title', 'veja o que mudou'); url := '/#/novidades';
    when 'tier_vote_result' then body := 'Votação do tier encerrada: ' || coalesce(p->>'title', ''); url := '/#/tier';
    when 'admin_new_user' then body := 'Novo usuário no PIU Stats'; url := '/#/admin?tab=users'; pic := null;
    else body := 'Você tem um aviso novo no PIU Stats';
  end case;
  return jsonb_build_object('title', 'PIU Stats', 'body', body, 'url', url, 'image', pic, 'tag', n.kind || ':' || coalesce(n.ref, n.id::text));
end $$;

revoke all on function public.push_text(notifications) from public, anon, authenticated;

revoke all on function public.push_text(notifications) from public, anon, authenticated;

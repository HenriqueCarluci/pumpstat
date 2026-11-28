-- 123: aviso de novidade para todos. O admin publica uma nota em Admin → Novidades e toca em "Avisar todos":
-- cada pessoa recebe a notificação 'release_note' (abre Novidades) e o push, conforme as preferências (categoria App).

create or replace function public.push_category(p_kind text)
 returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'chat'
    when p_kind = 'invite' then 'invites'
    when p_kind in ('friend_request', 'friend_accepted', 'friend_new') then 'friends'
    when p_kind in ('friend_live', 'friend_pumbility', 'friend_online') then 'friends_activity'
    when p_kind like 'team\_%' then 'team'
    when p_kind in ('app_update', 'feedback_reply', 'release_note') then 'app'
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
    when 'release_note' then body := 'Novidade no PIU Stats: ' || coalesce(p->>'title', 'veja o que mudou'); url := '/#/novidades';
    when 'tier_vote_result' then body := 'Votação do tier encerrada: ' || coalesce(p->>'title', ''); url := '/#/tier';
    when 'admin_new_user' then body := 'Novo usuário no PIU Stats'; url := '/#/admin?tab=users'; pic := null;
    else body := 'Você tem um aviso novo no PIU Stats';
  end case;
  return jsonb_build_object('title', 'PIU Stats', 'body', body, 'url', url, 'image', pic, 'tag', n.kind || ':' || coalesce(n.ref, n.id::text));
end $$;

revoke all on function public.push_text(notifications) from public, anon, authenticated;

-- avisa todas as contas ativas sobre uma novidade publicada (uma vez por nota; devolve quantas avisou)
create or replace function public.admin_notify_release(p_id bigint)
 returns int language plpgsql security definer set search_path to 'public', 'auth' as $$
declare n release_notes; v int;
begin
  perform admin_guard('config');
  select * into n from release_notes where id = p_id;
  if n.id is null then raise exception 'item não encontrado'; end if;
  if not n.published or n.status <> 'released' then raise exception 'publique a novidade como lançada antes de avisar'; end if;
  insert into notifications (user_id, kind, ref, payload)
  select u.id, 'release_note', 'release:' || n.id, jsonb_build_object('id', n.id, 'title', n.title->>'pt', 'titles', n.title)
    from auth.users u
   where u.deleted_at is null and (u.banned_until is null or u.banned_until < now())
     and not exists (select 1 from notifications x where x.user_id = u.id and x.kind = 'release_note' and x.ref = 'release:' || n.id);
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function public.admin_notify_release(bigint) from public, anon;
grant execute on function public.admin_notify_release(bigint) to authenticated;

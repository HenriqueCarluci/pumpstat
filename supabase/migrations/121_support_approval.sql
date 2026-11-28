-- 121: Suporte com aprovação do admin para tudo.
-- Problema (bug): o admin aprova para tratativa → entra na fila de correção diária (a tarefa só pega bugs aprovados).
-- Melhoria (idea): o admin aprova → entra na fila da próxima versão semanal.
-- E desconectar a conta da Pump de outra pessoa passa a ser só do dono.

create or replace function public.admin_feedback_decide(p_id bigint, p_decision text, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare f feedback; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), ''); v_st text;
begin
  perform admin_guard('feedback');
  if p_decision not in ('approved', 'rejected', 'open') then raise exception 'opção inválida'; end if;
  update feedback set status = p_decision, decided_at = case when p_decision = 'open' then null else now() end,
         decided_by = case when p_decision = 'open' then null else auth.uid() end,
         reply = case when p_decision = 'open' then null else coalesce(v_note, reply) end
   where id = p_id and kind in ('bug', 'idea') returning * into f;
  if f.id is null then raise exception 'item não encontrado'; end if;
  v_st := case when f.kind = 'bug' and p_decision = 'approved' then 'bug_approved'
               when f.kind = 'bug' and p_decision = 'rejected' then 'wontfix' else p_decision end;
  if f.user_id is not null and f.user_id <> auth.uid() and p_decision in ('approved', 'rejected') then
    insert into notifications (user_id, kind, ref, payload)
    values (f.user_id, 'feedback_reply', 'feedback:' || f.id || ':' || v_st,
            jsonb_build_object('id', f.id, 'status', v_st, 'kind', f.kind, 'reply', f.reply))
    on conflict do nothing;
  end if;
end $$;
revoke all on function public.admin_feedback_decide(bigint, text, text) from public, anon;
grant execute on function public.admin_feedback_decide(bigint, text, text) to authenticated;

-- item do próprio admin: aprovado já entra na fila (bug → correção diária; melhoria → semanal)
create or replace function public.admin_backlog_add(p_kind text, p_title text, p_message text, p_approved boolean default true, p_priority int default 2)
 returns bigint language plpgsql security definer set search_path to 'public' as $$
declare v_id bigint;
begin
  perform admin_guard('feedback');
  if p_kind not in ('bug', 'idea') then raise exception 'opção inválida'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 3 then raise exception 'escreva uma mensagem'; end if;
  insert into feedback (user_id, kind, title, message, meta, status, priority, decided_at, decided_by)
  values (auth.uid(), p_kind, nullif(left(trim(coalesce(p_title, '')), 120), ''), left(trim(p_message), 2000),
          jsonb_build_object('origem', 'admin'),
          case when p_approved then 'approved' else 'open' end,
          greatest(1, least(3, coalesce(p_priority, 2))),
          case when p_approved then now() end,
          case when p_approved then auth.uid() end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_backlog_add(text, text, text, boolean, int) from public, anon;
grant execute on function public.admin_backlog_add(text, text, text, boolean, int) to authenticated;

-- lista do suporte: "bugs" mostra os que esperam aprovação e os aprovados na fila de correção
create or replace function public.admin_feedback(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform admin_guard('feedback');
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'kind', f.kind, 'message', f.message, 'contact', f.contact, 'meta', f.meta,
            'emailed', f.emailed, 'status', f.status, 'at', f.created_at, 'shot', f.shot_url, 'reply', f.reply,
            'fixed_in', f.fixed_in, 'resolved_at', f.resolved_at, 'decided_at', f.decided_at,
            'user', f.user_id, 'email', u.email,
            'nickname', (select nickname from user_profiles p where p.user_id = f.user_id order by taken_at desc limit 1))
          order by f.created_at desc), '[]')
    from feedback f left join auth.users u on u.id = f.user_id
   where p_status = 'all'
      or (p_status = 'open' and f.status = 'open')
      or (p_status = 'ideas' and f.kind = 'idea' and f.status = 'open')
      or (p_status = 'approved' and f.status = 'approved')
      or (p_status = 'bugs' and f.kind = 'bug' and f.status in ('open', 'approved', 'need_info'))
      or (p_status = 'done' and f.status not in ('open', 'approved', 'need_info')));
end $$;

-- desconectar a conta da Pump de outra pessoa: só o dono
create or replace function public.admin_unlink_piu(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'só o dono do app pode desconectar a conta da Pump de alguém' using errcode = '42501'; end if;
  perform wipe_game_data(p_user);
  delete from user_syncs where user_id = p_user;
  delete from piu_sessions where user_id = p_user;
  update piu_accounts set game_id = null, piu_login = null, auto_sync = false, auto_sync_error = null, last_sync_at = null
   where user_id = p_user;
  insert into admin_actions_log (admin_id, action, target) values (auth.uid(), 'unlink_piu', p_user);
end $$;
revoke all on function public.admin_unlink_piu(uuid) from public, anon;
grant execute on function public.admin_unlink_piu(uuid) to authenticated;

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
                                            else 'Resposta ao seu report #' || (p->>'id') end
                                     || coalesce(': ' || left(p->>'reply', 140), ''); url := '/#/ajustes';
    when 'tier_vote_result' then body := 'Votação do tier encerrada: ' || coalesce(p->>'title', ''); url := '/#/tier';
    when 'admin_new_user' then body := 'Novo usuário no PIU Stats'; url := '/#/admin?tab=users'; pic := null;
    else body := 'Você tem um aviso novo no PIU Stats';
  end case;
  return jsonb_build_object('title', 'PIU Stats', 'body', body, 'url', url, 'image', pic, 'tag', n.kind || ':' || coalesce(n.ref, n.id::text));
end $$;

revoke all on function public.push_text(notifications) from public, anon, authenticated;

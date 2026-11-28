-- 122: "Meus chamados". Quem abriu um ticket pelo app acompanha o andamento: recebido → aprovado → resolvido,
-- com a resposta do suporte. Quando o suporte pede mais detalhes, a pessoa responde pelo próprio app e o
-- ticket volta para a fila em que estava (aprovado → correção diária; ainda não decidido → esperando decisão).

create or replace function public.my_feedback()
 returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'kind', f.kind, 'title', f.title, 'message', f.message, 'status', f.status, 'reply', f.reply,
      'fixed_in', f.fixed_in, 'shot', f.shot_url, 'at', f.created_at, 'decided_at', f.decided_at,
      'resolved_at', f.resolved_at) order by f.created_at desc), '[]'::jsonb)
    from (select * from feedback where user_id = auth.uid() and auth.uid() is not null
           and coalesce(meta->>'origem', '') not in ('admin', 'backlog do produto')
           order by created_at desc limit 50) f
$$;
revoke all on function public.my_feedback() from public, anon;
grant execute on function public.my_feedback() to authenticated;

create or replace function public.my_feedback_add_info(p_id bigint, p_text text)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare f feedback; v_text text := left(trim(coalesce(p_text, '')), 800); v_new text;
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if char_length(v_text) < 3 then raise exception 'escreva uma mensagem'; end if;
  select * into f from feedback where id = p_id and user_id = auth.uid() for update;
  if f.id is null then raise exception 'item não encontrado'; end if;
  if f.status not in ('need_info', 'open', 'approved') then raise exception 'este chamado já foi encerrado'; end if;
  v_new := f.message || E'\n\n— Mais detalhes (' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '): ' || v_text;
  if char_length(v_new) > 2000 then raise exception 'este chamado já está com texto demais; abra um novo pelo suporte'; end if;
  update feedback
     set message = v_new,
         status = case when status = 'need_info' then case when decided_at is not null then 'approved' else 'open' end else status end,
         resolved_at = case when status = 'need_info' then null else resolved_at end
   where id = f.id;
end $$;
revoke all on function public.my_feedback_add_info(bigint, text) from public, anon;
grant execute on function public.my_feedback_add_info(bigint, text) to authenticated;

-- o aviso de resposta abre o chamado em "Meus chamados"
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
    when 'tier_vote_result' then body := 'Votação do tier encerrada: ' || coalesce(p->>'title', ''); url := '/#/tier';
    when 'admin_new_user' then body := 'Novo usuário no PIU Stats'; url := '/#/admin?tab=users'; pic := null;
    else body := 'Você tem um aviso novo no PIU Stats';
  end case;
  return jsonb_build_object('title', 'PIU Stats', 'body', body, 'url', url, 'image', pic, 'tag', n.kind || ':' || coalesce(n.ref, n.id::text));
end $$;

revoke all on function public.push_text(notifications) from public, anon, authenticated;

-- admin responde o chamado pelo app: só responder (mantém a fila), pedir detalhes ou responder e encerrar
create or replace function public.admin_feedback_answer(p_id bigint, p_reply text, p_action text default 'reply')
 returns void language plpgsql security definer set search_path to 'public' as $$
declare f feedback; v_reply text := nullif(left(trim(coalesce(p_reply, '')), 1000), ''); v_st text;
begin
  perform admin_guard('feedback');
  if p_action not in ('reply', 'need_info', 'answered') then raise exception 'opção inválida'; end if;
  if v_reply is null then raise exception 'escreva uma mensagem'; end if;
  update feedback set reply = v_reply,
         status = case when p_action = 'reply' then status else p_action end,
         resolved_at = case when p_action = 'answered' then now() when p_action = 'need_info' then null else resolved_at end
   where id = p_id returning * into f;
  if f.id is null then raise exception 'item não encontrado'; end if;
  v_st := case when p_action = 'reply' then 'reply' else p_action end;
  if f.user_id is not null and f.user_id <> auth.uid() then
    insert into notifications (user_id, kind, ref, payload)
    values (f.user_id, 'feedback_reply', 'feedback:' || f.id || ':' || v_st || ':' || extract(epoch from now())::bigint,
            jsonb_build_object('id', f.id, 'status', v_st, 'kind', f.kind, 'reply', v_reply));
  end if;
end $$;
revoke all on function public.admin_feedback_answer(bigint, text, text) from public, anon;
grant execute on function public.admin_feedback_answer(bigint, text, text) to authenticated;

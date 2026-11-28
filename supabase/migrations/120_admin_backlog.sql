-- 120: Admin → Backlog. Um lugar só para o admin acompanhar os bugs (correção diária) e decidir o que entra
-- na versão semanal: sugestões dos usuários e itens do próprio admin, com prioridade (1 alta, 2 média, 3 baixa).
alter table public.feedback add column if not exists priority smallint not null default 2 check (priority between 1 and 3);
alter table public.feedback add column if not exists title text check (title is null or length(title) <= 120);

create or replace function public.admin_backlog()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth' as $$
begin
  perform admin_guard('feedback');
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'status', f.status, 'title', f.title, 'message', f.message, 'reply', f.reply,
        'priority', f.priority, 'fixed_in', f.fixed_in, 'shot', f.shot_url, 'page', f.meta->>'page', 'app', f.meta->>'app',
        'origin', f.meta->>'origem', 'at', f.created_at, 'decided_at', f.decided_at, 'resolved_at', f.resolved_at,
        'nickname', coalesce((select nickname from user_profiles p where p.user_id = f.user_id and nickname is not null order by taken_at desc limit 1), account_label(f.user_id)))
        order by f.created_at desc)
      from feedback f
     where f.kind in ('bug', 'idea')
       and (f.status in ('open', 'approved', 'need_info') or coalesce(f.resolved_at, f.decided_at, f.created_at) > now() - interval '45 days')), '[]'::jsonb),
    'errors_24h', (select count(*) from client_errors where at > now() - interval '24 hours' and coalesce(source, '') <> 'diag'));
end $$;
revoke all on function public.admin_backlog() from public, anon;
grant execute on function public.admin_backlog() to authenticated;

-- item criado pelo admin: melhoria (vai direto para aprovada ou fica no backlog) ou bug (entra na correção diária)
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
          case when p_kind = 'idea' and p_approved then 'approved' else 'open' end,
          greatest(1, least(3, coalesce(p_priority, 2))),
          case when p_kind = 'idea' and p_approved then now() end,
          case when p_kind = 'idea' and p_approved then auth.uid() end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_backlog_add(text, text, text, boolean, int) from public, anon;
grant execute on function public.admin_backlog_add(text, text, text, boolean, int) to authenticated;

create or replace function public.admin_backlog_priority(p_id bigint, p_priority int)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform admin_guard('feedback');
  update feedback set priority = greatest(1, least(3, coalesce(p_priority, 2))) where id = p_id;
end $$;
revoke all on function public.admin_backlog_priority(bigint, int) from public, anon;
grant execute on function public.admin_backlog_priority(bigint, int) to authenticated;

-- decisão do admin: aprovar/recusar/voltar sugestão (avisa quem sugeriu, se não foi o próprio admin)
create or replace function public.admin_feedback_decide(p_id bigint, p_decision text, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare f feedback; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  perform admin_guard('feedback');
  if p_decision not in ('approved', 'rejected', 'open') then raise exception 'opção inválida'; end if;
  update feedback set status = p_decision, decided_at = now(), decided_by = auth.uid(),
         reply = case when p_decision = 'open' then null else coalesce(v_note, reply) end
   where id = p_id and kind = 'idea' returning * into f;
  if f.id is null then raise exception 'sugestão não encontrada'; end if;
  if f.user_id is not null and f.user_id <> auth.uid() and p_decision in ('approved', 'rejected') then
    insert into notifications (user_id, kind, ref, payload)
    values (f.user_id, 'feedback_reply', 'feedback:' || f.id || ':' || p_decision,
            jsonb_build_object('id', f.id, 'status', p_decision, 'reply', f.reply));
  end if;
end $$;

-- 118: suporte em duas filas.
-- Problema (kind 'bug'): fila de correção diária (tarefa do Claude, uma versão por dia).
-- Sugestão (kind 'idea'): backlog de melhorias; só entra na versão semanal depois que o admin aprova.
-- status: open (novo) → approved (aprovada para a semanal) → implemented; ou rejected. Bugs: open → fixed/need_info/wontfix/answered.
alter table public.feedback add column if not exists decided_at timestamptz;
alter table public.feedback add column if not exists decided_by uuid references auth.users(id) on delete set null;

-- decisão do admin sobre uma sugestão (ou devolver ao backlog); avisa quem sugeriu
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
  if f.user_id is not null and p_decision in ('approved', 'rejected') then
    insert into notifications (user_id, kind, ref, payload)
    values (f.user_id, 'feedback_reply', 'feedback:' || f.id || ':' || p_decision,
            jsonb_build_object('id', f.id, 'status', p_decision, 'reply', f.reply));
  end if;
end $$;
revoke all on function public.admin_feedback_decide(bigint, text, text) from public, anon;
grant execute on function public.admin_feedback_decide(bigint, text, text) to authenticated;

-- fechamento pela tarefa (bug corrigido, sugestão implementada, resposta)
create or replace function public.feedback_reply(p_id bigint, p_status text, p_reply text, p_fixed_in text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  if auth.uid() is not null then perform admin_guard('users'); end if;
  if p_status not in ('fixed', 'wontfix', 'need_info', 'answered', 'implemented', 'rejected') then raise exception 'status inválido'; end if;
  update feedback set status = p_status, reply = left(trim(p_reply), 1000), fixed_in = nullif(trim(coalesce(p_fixed_in, '')), ''),
         resolved_at = now()
   where id = p_id returning * into f;
  if f.id is null then raise exception 'report não encontrado'; end if;
  if f.user_id is not null then
    insert into notifications (user_id, kind, ref, payload)
    values (f.user_id, 'feedback_reply', 'feedback:' || f.id || ':' || p_status,
            jsonb_build_object('id', f.id, 'status', f.status, 'reply', f.reply, 'fixed_in', f.fixed_in));
  end if;
end $$;

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
      or (p_status = 'bugs' and f.kind = 'bug' and f.status = 'open')
      or (p_status = 'done' and f.status not in ('open', 'approved')));
end $$;

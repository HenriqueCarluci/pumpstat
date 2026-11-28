-- 114: "Reportar um problema" para a correção automática.
-- O report pode levar um print (bucket "feedback-shots", pasta de quem enviou, nome aleatório).
-- A tarefa diária do Claude lê os problemas em aberto (kind 'bug', status 'open') e, ao terminar,
-- chama feedback_reply: grava a resposta e avisa quem reportou por notificação no app.
alter table public.feedback add column if not exists shot_url text check (shot_url is null or length(shot_url) <= 400);
alter table public.feedback add column if not exists reply text check (reply is null or length(reply) <= 1000);
alter table public.feedback add column if not exists fixed_in text check (fixed_in is null or length(fixed_in) <= 40);
alter table public.feedback add column if not exists resolved_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-shots', 'feedback-shots', true, 1572864, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'feedback shots: upload na própria pasta') then
    create policy "feedback shots: upload na própria pasta" on storage.objects for insert to authenticated
      with check (bucket_id = 'feedback-shots' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

create or replace function public.submit_feedback(p_kind text, p_message text, p_contact text, p_meta jsonb default '{}'::jsonb, p_shot text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id bigint; v_shot text := nullif(trim(coalesce(p_shot, '')), '');
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if (select count(*) from feedback where user_id = me and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'muitas mensagens na última hora. Tente mais tarde';
  end if;
  if char_length(trim(coalesce(p_message, ''))) < 3 then raise exception 'escreva uma mensagem'; end if;
  -- o print só pode ser um arquivo da pasta de quem envia, no bucket do suporte
  if v_shot is not null and v_shot !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/feedback-shots/' || me::text || '/[A-Za-z0-9._-]+$') then
    v_shot := null;
  end if;
  insert into feedback (user_id, kind, message, contact, meta, shot_url, status)
  values (me, p_kind, left(trim(p_message), 2000), left(nullif(trim(coalesce(p_contact, '')), ''), 200), coalesce(p_meta, '{}'), v_shot, 'open')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_feedback(text, text, text, jsonb, text) from public, anon;
grant execute on function public.submit_feedback(text, text, text, jsonb, text) to authenticated;
drop function if exists public.submit_feedback(text, text, text, jsonb);

-- Resposta ao report (usada pela tarefa de correção e pelo admin): fecha o report e avisa quem enviou.
create or replace function public.feedback_reply(p_id bigint, p_status text, p_reply text, p_fixed_in text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  if auth.uid() is not null then perform admin_guard('users'); end if;
  if p_status not in ('fixed', 'wontfix', 'need_info', 'answered') then raise exception 'status inválido'; end if;
  update feedback set status = p_status, reply = left(trim(p_reply), 1000), fixed_in = nullif(trim(coalesce(p_fixed_in, '')), ''),
         resolved_at = now()
   where id = p_id returning * into f;
  if f.id is null then raise exception 'report não encontrado'; end if;
  if f.user_id is not null then
    insert into notifications (user_id, kind, ref, payload)
    values (f.user_id, 'feedback_reply', 'feedback:' || f.id,
            jsonb_build_object('id', f.id, 'status', f.status, 'reply', f.reply, 'fixed_in', f.fixed_in));
  end if;
end $$;
revoke all on function public.feedback_reply(bigint, text, text, text) from public, anon;
grant execute on function public.feedback_reply(bigint, text, text, text) to authenticated;

-- painel: o print, a resposta e a versão da correção aparecem junto do report
create or replace function public.admin_feedback(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform admin_guard('feedback');
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'kind', f.kind, 'message', f.message, 'contact', f.contact, 'meta', f.meta,
            'emailed', f.emailed, 'status', f.status, 'at', f.created_at, 'shot', f.shot_url, 'reply', f.reply,
            'fixed_in', f.fixed_in, 'resolved_at', f.resolved_at,
            'user', f.user_id, 'email', u.email,
            'nickname', (select nickname from user_profiles p where p.user_id = f.user_id order by taken_at desc limit 1))
          order by f.created_at desc), '[]')
    from feedback f left join auth.users u on u.id = f.user_id
   where p_status = 'all' or (p_status = 'done' and f.status <> 'open') or f.status = p_status);
end $$;

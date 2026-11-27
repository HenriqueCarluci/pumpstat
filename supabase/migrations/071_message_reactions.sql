-- 071: reações com emoji nas mensagens do chat entre amigos (uma reação por pessoa por mensagem).
create table if not exists public.message_reactions (
  invite_id bigint not null references public.play_invites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🔥', '😮', '💪')),
  created_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;

-- reage (ou troca a reação); o mesmo emoji de novo, ou null, tira a reação
create or replace function public.react_message(p_invite bigint, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from uuid; v_to uuid; v_cur text;
begin
  if auth.uid() is null then raise exception 'faça login para reagir'; end if;
  select from_user, to_user into v_from, v_to from play_invites where id = p_invite;
  if v_from is null or auth.uid() not in (v_from, v_to) or not are_friends(v_from, v_to) then raise exception 'você não pode reagir a esta mensagem'; end if;
  select emoji into v_cur from message_reactions where invite_id = p_invite and user_id = auth.uid();
  if p_emoji is null or p_emoji = v_cur then
    delete from message_reactions where invite_id = p_invite and user_id = auth.uid();
    return jsonb_build_object('emoji', null);
  end if;
  insert into message_reactions (invite_id, user_id, emoji) values (p_invite, auth.uid(), p_emoji)
  on conflict (invite_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  return jsonb_build_object('emoji', p_emoji);
end $$;
revoke all on function public.react_message(bigint, text) from public, anon;
grant execute on function public.react_message(bigint, text) to authenticated;

-- o chat devolve as reações de cada mensagem: [{e: emoji, mine: bool}]
create or replace function public.chat_with(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by at), '[]') from (
    select jsonb_build_object('id', i.id, 'mine', i.from_user = auth.uid(), 'kind', i.kind, 'message', i.message,
             'status', i.status, 'at', i.created_at,
             'reactions', coalesce((select jsonb_agg(jsonb_build_object('e', r.emoji, 'mine', r.user_id = auth.uid()) order by r.created_at)
                                      from message_reactions r where r.invite_id = i.id), '[]'::jsonb)) x,
           i.created_at at
      from play_invites i
     where auth.uid() is not null and are_friends(auth.uid(), p_user) and auth.uid() <> p_user
       and ((i.from_user = auth.uid() and i.to_user = p_user) or (i.from_user = p_user and i.to_user = auth.uid()))
     order by i.created_at desc limit 50) z
$$;

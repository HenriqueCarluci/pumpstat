-- Status do jogador com o app aberto (estilo MSN): online, ausente, ocupado ou aparecer offline.
-- "Aparecer offline" usa o modo 'off' de visibilidade; a escolha anterior (todos/amigos) fica guardada em vis_mode.
alter table public.user_presence add column if not exists status text not null default 'online' check (status in ('online', 'away', 'busy'));
alter table public.user_presence add column if not exists vis_mode text check (vis_mode in ('all', 'friends'));

create or replace function public.set_presence_status(p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r user_presence;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_status not in ('online', 'away', 'busy', 'invisible') then raise exception 'opção inválida'; end if;
  insert into user_presence (user_id) values (me) on conflict (user_id) do nothing;
  if p_status = 'invisible' then
    update user_presence set vis_mode = case when mode in ('all', 'friends') then mode else vis_mode end, mode = 'off', status = 'online'
     where user_id = me returning * into r;
  else
    update user_presence set status = p_status, mode = case when mode = 'off' then coalesce(vis_mode, 'all') else mode end
     where user_id = me returning * into r;
  end if;
  return jsonb_build_object('status', case when r.mode = 'off' then 'invisible' else r.status end, 'mode', r.mode);
end $$;
revoke all on function public.set_presence_status(text) from public, anon;
grant execute on function public.set_presence_status(text) to authenticated;

-- o cartão de presença passa a levar o status (nulo para quem aparece offline)
create or replace function public.presence_card(p_viewer uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p_user, 'friend', are_friends(p_viewer, p_user),
           'title', pr.title, 'nickname', pr.nickname, 'avatar', pr.avatar_url,
           'status', (select case when up.mode = 'off' then null else up.status end from user_presence up where up.user_id = p_user))
    from (select 1) x
    left join lateral (select title, nickname, avatar_url from user_profiles p where p.user_id = p_user
                        order by (p.version = 'phoenix2') desc, taken_at desc limit 1) pr on true
$$;

-- convite para jogar não vai para quem está ocupado (mensagem continua indo)
create or replace function public.send_invite(p_user uuid, p_message text default null, p_kind text default 'invite')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_venue text; v_msg text := left(nullif(trim(coalesce(p_message, '')), ''), 140);
  v_online boolean; v_friend boolean;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user = me then raise exception 'você não pode convidar a si mesmo'; end if;
  if p_kind not in ('invite', 'message') then raise exception 'opção inválida'; end if;
  if is_blocked(me, p_user) then raise exception 'não é possível falar com este jogador'; end if;
  v_friend := are_friends(me, p_user);
  v_online := exists (select 1 from user_presence p where p.user_id = p_user and p.last_seen > now() - interval '3 minutes'
                       and (p.mode = 'all' or (p.mode = 'friends' and v_friend)));
  if p_kind = 'message' then
    if not v_friend then raise exception 'só dá para mandar mensagem para amigos'; end if;
    if v_msg is null then raise exception 'escreva uma mensagem'; end if;
    if exists (select 1 from play_invites where from_user = me and to_user = p_user and created_at > now() - interval '3 seconds') then
      raise exception 'espere alguns segundos antes de mandar outra';
    end if;
  else
    if not v_online and not v_friend then raise exception 'essa pessoa não está mais online'; end if;
    if v_online and exists (select 1 from user_presence p where p.user_id = p_user and p.status = 'busy') then
      raise exception 'essa pessoa está ocupada agora. Mande uma mensagem ou tente mais tarde';
    end if;
    if exists (select 1 from play_invites where from_user = me and to_user = p_user and kind = 'invite'
                and created_at > now() - interval '10 minutes') then
      raise exception 'você já chamou essa pessoa há pouco. Espere a resposta';
    end if;
  end if;
  if (select count(*) from play_invites where from_user = me and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'muitos convites na última hora. Tente mais tarde';
  end if;
  select venue_slug into v_venue from user_presence where user_id = me;
  insert into play_invites (from_user, to_user, message, venue_slug, kind) values (me, p_user, v_msg, v_venue, p_kind);
  return jsonb_build_object('sent', true, 'online', v_online);
end $$;

-- o batimento devolve também o meu status
create or replace function public.heartbeat(p_venue text default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into user_presence (user_id, last_seen, venue_slug) values (me, now(), nullif(p_venue, ''))
  on conflict (user_id) do update set last_seen = now(), venue_slug = coalesce(nullif(excluded.venue_slug, ''), user_presence.venue_slug);
  return jsonb_build_object(
    'online', (select count(*) from user_presence p where p.user_id <> me and p.last_seen > now() - interval '3 minutes'
                and (p.mode = 'all' or (p.mode = 'friends' and are_friends(me, p.user_id)))),
    'mode', (select mode from user_presence where user_id = me),
    'status', (select case when mode = 'off' then 'invisible' else status end from user_presence where user_id = me),
    'friends', (select coalesce(jsonb_agg(presence_card(me, p.user_id) || jsonb_build_object(
                   'venue', (select name from venues v where v.slug = p.venue_slug))), '[]')
                  from user_presence p
                  join friendships f on f.status = 'accepted'
                   and ((f.requester = me and f.addressee = p.user_id) or (f.addressee = me and f.requester = p.user_id))
                 where p.user_id <> me and p.last_seen > now() - interval '3 minutes' and p.mode <> 'off'
                   and not is_blocked(me, p.user_id)),
    'invites', (select coalesce(jsonb_agg(presence_card(me, i.from_user) || jsonb_build_object(
                   'invite', i.id, 'kind', i.kind, 'message', i.message, 'at', i.created_at,
                   'venue', (select name from venues v where v.slug = i.venue_slug)) order by i.created_at), '[]')
                  from play_invites i where i.to_user = me and i.status = 'pending'
                   and i.created_at > now() - case when i.kind = 'message' then interval '7 days' else interval '2 hours' end),
    'replies', (select coalesce(jsonb_agg(presence_card(me, i.to_user) || jsonb_build_object(
                   'invite', i.id, 'status', i.status, 'at', i.responded_at) order by i.responded_at desc), '[]')
                  from play_invites i where i.from_user = me and i.kind = 'invite' and i.status <> 'pending'
                   and i.responded_at > now() - interval '10 minutes'));
end $function$;

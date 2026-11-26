-- Aviso "amigo ficou online" (estilo MSN): o batimento devolve os amigos online agora.
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

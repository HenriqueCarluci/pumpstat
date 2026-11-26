-- 024: quem está online (app aberto), convites para jogar e sugestão de x1
create table if not exists public.user_presence (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  last_seen  timestamptz not null default now(),
  venue_slug text,
  mode       text not null default 'all' check (mode in ('all', 'friends', 'off'))  -- quem pode me ver online
);
alter table public.user_presence enable row level security;
drop policy if exists "dono" on public.user_presence;
create policy "dono" on public.user_presence for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.user_presence from anon, authenticated;

create table if not exists public.play_invites (
  id           bigint generated always as identity primary key,
  from_user    uuid not null references auth.users(id) on delete cascade,
  to_user      uuid not null references auth.users(id) on delete cascade,
  message      text check (char_length(message) <= 140),
  venue_slug   text,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists play_invites_to_idx on public.play_invites (to_user, created_at desc);
create index if not exists play_invites_from_idx on public.play_invites (from_user, created_at desc);
alter table public.play_invites enable row level security;
drop policy if exists "participantes" on public.play_invites;
create policy "participantes" on public.play_invites for select to authenticated using (auth.uid() in (from_user, to_user));
revoke insert, update, delete on public.play_invites from anon, authenticated;

-- cartão mínimo: título sempre; nick e avatar só para amigos
create or replace function public.presence_card(p_viewer uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p_user, 'friend', are_friends(p_viewer, p_user),
           'title', pr.title,
           'nickname', case when are_friends(p_viewer, p_user) then pr.nickname end,
           'avatar', case when are_friends(p_viewer, p_user) then pr.avatar_url end)
    from (select 1) x
    left join lateral (select title, nickname, avatar_url from user_profiles p where p.user_id = p_user
                        order by (p.version = 'phoenix2') desc, taken_at desc limit 1) pr on true
$$;
revoke all on function public.presence_card(uuid, uuid) from public, anon, authenticated;

-- chamado pelo app a cada ~30 s com a tela aberta; devolve quantos estão online e os convites pendentes
create or replace function public.heartbeat(p_venue text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into user_presence (user_id, last_seen, venue_slug) values (me, now(), nullif(p_venue, ''))
  on conflict (user_id) do update set last_seen = now(), venue_slug = coalesce(nullif(excluded.venue_slug, ''), user_presence.venue_slug);
  return jsonb_build_object(
    'online', (select count(*) from user_presence p where p.user_id <> me and p.last_seen > now() - interval '3 minutes'
                and (p.mode = 'all' or (p.mode = 'friends' and are_friends(me, p.user_id)))),
    'mode', (select mode from user_presence where user_id = me),
    'invites', (select coalesce(jsonb_agg(presence_card(me, i.from_user) || jsonb_build_object(
                   'invite', i.id, 'message', i.message, 'at', i.created_at,
                   'venue', (select name from venues v where v.slug = i.venue_slug)) order by i.created_at desc), '[]')
                  from play_invites i where i.to_user = me and i.status = 'pending' and i.created_at > now() - interval '2 hours'),
    'replies', (select coalesce(jsonb_agg(presence_card(me, i.to_user) || jsonb_build_object(
                   'invite', i.id, 'status', i.status, 'at', i.responded_at) order by i.responded_at desc), '[]')
                  from play_invites i where i.from_user = me and i.status <> 'pending' and i.responded_at > now() - interval '10 minutes'));
end $$;
revoke all on function public.heartbeat(text) from public, anon;
grant execute on function public.heartbeat(text) to authenticated;

create or replace function public.set_presence_mode(p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_mode not in ('all', 'friends', 'off') then raise exception 'opção inválida'; end if;
  insert into user_presence (user_id, mode) values (auth.uid(), p_mode)
  on conflict (user_id) do update set mode = excluded.mode;
end $$;
revoke all on function public.set_presence_mode(text) from public, anon;
grant execute on function public.set_presence_mode(text) to authenticated;

-- jogadores online. match: quão parecido é o PUMBILITY (sem mostrar o número de quem não é amigo)
create or replace function public.online_players()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_pb numeric; v_venue text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select pumbility into v_pb from user_profiles where user_id = me and version = 'phoenix2' order by taken_at desc limit 1;
  select venue_slug into v_venue from user_presence where user_id = me;
  return (
    select coalesce(jsonb_agg(card order by same_venue desc, diff nulls last, friend desc), '[]') from (
      select presence_card(me, p.user_id) || jsonb_build_object(
               'same_venue', v_venue is not null and p.venue_slug = v_venue,
               'venue', (select name from venues v where v.slug = p.venue_slug),
               'match', case when v_pb is null or pb.pumbility is null then null
                             when abs(pb.pumbility - v_pb) <= 500 then 'close'
                             when abs(pb.pumbility - v_pb) <= 1500 then 'near' else 'far' end,
               'pumbility', case when are_friends(me, p.user_id) then pb.pumbility end,
               'invited', exists (select 1 from play_invites i where i.from_user = me and i.to_user = p.user_id
                                   and i.status = 'pending' and i.created_at > now() - interval '2 hours'),
               'since', p.last_seen) as card,
             (v_venue is not null and p.venue_slug = v_venue) as same_venue,
             abs(pb.pumbility - v_pb) as diff,
             are_friends(me, p.user_id) as friend
        from user_presence p
        left join lateral (select pumbility from user_profiles u where u.user_id = p.user_id and u.version = 'phoenix2'
                            order by taken_at desc limit 1) pb on true
       where p.user_id <> me and p.last_seen > now() - interval '3 minutes'
         and (p.mode = 'all' or (p.mode = 'friends' and are_friends(me, p.user_id)))
    ) z);
end $$;
revoke all on function public.online_players() from public, anon;
grant execute on function public.online_players() to authenticated;

create or replace function public.send_invite(p_user uuid, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_venue text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user = me then raise exception 'você não pode convidar a si mesmo'; end if;
  if not exists (select 1 from user_presence p where p.user_id = p_user and p.last_seen > now() - interval '3 minutes'
                  and (p.mode = 'all' or (p.mode = 'friends' and are_friends(me, p_user)))) then
    raise exception 'essa pessoa não está mais online';
  end if;
  if exists (select 1 from play_invites where from_user = me and to_user = p_user and created_at > now() - interval '10 minutes') then
    raise exception 'você já chamou essa pessoa há pouco. Espere a resposta';
  end if;
  if (select count(*) from play_invites where from_user = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'muitos convites na última hora. Tente mais tarde';
  end if;
  select venue_slug into v_venue from user_presence where user_id = me;
  insert into play_invites (from_user, to_user, message, venue_slug)
  values (me, p_user, left(nullif(trim(coalesce(p_message, '')), ''), 140), v_venue);
  return jsonb_build_object('sent', true);
end $$;
revoke all on function public.send_invite(uuid, text) from public, anon;
grant execute on function public.send_invite(uuid, text) to authenticated;

create or replace function public.respond_invite(p_invite bigint, p_accept boolean)
returns void language sql security definer set search_path = public as $$
  update play_invites set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = p_invite and to_user = auth.uid() and status = 'pending';
$$;
revoke all on function public.respond_invite(bigint, boolean) from public, anon;
grant execute on function public.respond_invite(bigint, boolean) to authenticated;

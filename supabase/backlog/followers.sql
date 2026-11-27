-- BACKLOG (não aplicado). Seguidores: ver docs/SPEC.md 6.4. Revisar contra as funções atuais antes de virar migração.
-- Seguidores: quem deixa o perfil público pode ser seguido por qualquer jogador, sem aprovação.
-- Quem segue vê as notas (como um amigo), aparece nos rankings dos charts e recebe passes, recordes, PUMBILITY e lives.
-- Chat, convites e rival continuam só entre amigos. Liga/desliga geral: toggle 'followers'.
alter table public.user_settings add column if not exists public_profile boolean not null default false;

create table if not exists public.follows (
  follower   uuid not null references auth.users (id) on delete cascade,
  followee   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on public.follows (followee);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;

create or replace function public.is_public(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.toggle_on('followers') and coalesce((select public_profile from user_settings where user_id = p_user), false)
$$;

-- pode ver as notas de b: amigo, ou perfil público (e ninguém bloqueou ninguém)
create or replace function public.can_view(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select are_friends(a, b) or (public.is_public(b) and not is_blocked(a, b))
$$;

create or replace function public.follow_player(p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user = me then raise exception 'você não pode seguir a si mesmo'; end if;
  if not public.is_public(p_user) or is_blocked(me, p_user) then raise exception 'este perfil não está aberto para seguidores'; end if;
  insert into follows (follower, followee) values (me, p_user) on conflict do nothing;
  if found then
    insert into notifications (user_id, kind, actor, ref, payload) values (p_user, 'new_follower', me, me::text, '{}'::jsonb);
  end if;
  return public.follow_info(p_user);
end $$;

create or replace function public.unfollow_player(p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  delete from follows where follower = auth.uid() and followee = p_user;
  return public.follow_info(p_user);
end $$;

-- tira um seguidor (o dono do perfil decide)
create or replace function public.remove_follower(p_user uuid) returns void language sql security definer set search_path = public as $$
  delete from follows where follower = p_user and followee = auth.uid()
$$;

create or replace function public.follow_info(p_user uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(profile_card(p_user), jsonb_build_object('id', p_user)) || jsonb_build_object(
    'public', public.is_public(p_user),
    'friend', are_friends(auth.uid(), p_user) and auth.uid() <> p_user,
    'following', exists (select 1 from follows where follower = auth.uid() and followee = p_user),
    'follows_me', exists (select 1 from follows where follower = p_user and followee = auth.uid()),
    'followers', (select count(*) from follows where followee = p_user),
    'following_count', (select count(*) from follows where follower = p_user),
    'pumbility', (select pumbility from visible_profiles p where p.user_id = p_user and p.version = 'phoenix2' order by taken_at desc limit 1),
    'private', stats_private(p_user))
  where auth.uid() is not null
$$;

-- minhas listas: quem eu sigo e quem me segue
create or replace function public.my_follows(p_version text default 'phoenix2') returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'public', public.is_public(auth.uid()),
    'following', coalesce((select jsonb_agg(profile_card(f.followee) || jsonb_build_object('since', f.created_at, 'public', public.is_public(f.followee),
                   'pumbility', (select pumbility from visible_profiles p where p.user_id = f.followee and p.version = p_version order by taken_at desc limit 1))
                   order by f.created_at desc) from follows f where f.follower = auth.uid() and not is_blocked(auth.uid(), f.followee)), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(profile_card(f.follower) || jsonb_build_object('since', f.created_at,
                   'friend', are_friends(auth.uid(), f.follower),
                   'pumbility', (select pumbility from visible_profiles p where p.user_id = f.follower and p.version = p_version order by taken_at desc limit 1))
                   order by f.created_at desc) from follows f where f.followee = auth.uid() and not is_blocked(auth.uid(), f.follower)), '[]'::jsonb))
  where auth.uid() is not null
$$;

create or replace function public.my_public_profile() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public_profile from user_settings where user_id = auth.uid()), false)
$$;
create or replace function public.set_public_profile(p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into user_settings (user_id, public_profile) values (auth.uid(), p_on)
  on conflict (user_id) do update set public_profile = excluded.public_profile;
  return p_on;
end $$;

revoke all on function public.follow_player(uuid), public.unfollow_player(uuid), public.remove_follower(uuid), public.follow_info(uuid),
  public.my_follows(text), public.my_public_profile(), public.set_public_profile(boolean) from public, anon;
grant execute on function public.follow_player(uuid), public.unfollow_player(uuid), public.remove_follower(uuid), public.follow_info(uuid),
  public.my_follows(text), public.my_public_profile(), public.set_public_profile(boolean) to authenticated;
grant execute on function public.is_public(uuid), public.can_view(uuid, uuid) to authenticated;

-- ver notas: amigo ou perfil público
create or replace function public.compare_player(p_other uuid, p_version text default 'phoenix2')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not can_view(auth.uid(), p_other) then
    raise exception 'as notas só aparecem depois que o jogador aprovar sua solicitação';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_array(c.id, m.score, m.grade, m.plate, m.broken, o.score, o.grade, o.plate, o.broken)), '[]'::jsonb)
      from charts c
      left join visible_scores m on m.chart_id = c.id and m.user_id = auth.uid()
      left join visible_scores o on o.chart_id = c.id and o.user_id = p_other
     where c.version = p_version and (m.score is not null or o.score is not null)
  );
end $$;

-- rankings do chart e notas da música: amigos + quem eu sigo
create or replace function public.chart_ranking(p_chart_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'score')::int desc), '[]'::jsonb) from (
    select jsonb_build_object('id', s.user_id, 'me', s.user_id = auth.uid(), 'score', s.score, 'grade', s.grade,
             'plate', s.plate, 'broken', s.broken,
             'nickname', (select nickname from visible_profiles p where p.user_id = s.user_id order by taken_at desc limit 1),
             'avatar', (select avatar_url from visible_profiles p where p.user_id = s.user_id order by taken_at desc limit 1)) x
      from visible_scores s
     where s.chart_id = p_chart_id and auth.uid() is not null
       and (are_friends(auth.uid(), s.user_id)
            or (exists (select 1 from follows f where f.follower = auth.uid() and f.followee = s.user_id) and can_view(auth.uid(), s.user_id)))
     order by s.score desc limit 20) t
$$;

create or replace function public.song_friend_scores(p_song bigint, p_version text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('chart', s.chart_id, 'user', s.user_id, 'score', s.score, 'grade', s.grade,
           'plate', s.plate, 'broken', s.broken, 'nickname', pr.nickname, 'avatar', pr.avatar_url)
         order by s.chart_id, s.broken, s.score desc), '[]'::jsonb)
    from visible_scores s
    join charts c on c.id = s.chart_id and c.song_id = p_song and c.version = p_version
    left join lateral (select nickname, avatar_url from visible_profiles p where p.user_id = s.user_id order by taken_at desc limit 1) pr on true
   where auth.uid() is not null and s.user_id <> auth.uid()
     and (are_friends(auth.uid(), s.user_id)
          or (exists (select 1 from follows f where f.follower = auth.uid() and f.followee = s.user_id) and can_view(auth.uid(), s.user_id)))
     and not exists (select 1 from user_blocks b where (b.blocker = auth.uid() and b.blocked = s.user_id) or (b.blocker = s.user_id and b.blocked = auth.uid()))
$$;

-- busca: diz se o perfil é público e se eu já sigo
create or replace function public.search_players(p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by rk, nick), '[]'::jsonb) from (
    select profile_card(a.user_id) || jsonb_build_object('relation',
             case when are_friends(auth.uid(), a.user_id) then 'friends'
                  when exists (select 1 from friendships f where f.requester = auth.uid() and f.addressee = a.user_id) then 'pending_out'
                  when exists (select 1 from friendships f where f.requester = a.user_id and f.addressee = auth.uid()) then 'pending_in'
                  else 'none' end,
             'public', public.is_public(a.user_id),
             'following', exists (select 1 from follows f where f.follower = auth.uid() and f.followee = a.user_id)) x,
           case when n.nickname ilike trim(p_query) || '%' then 0 else 1 end rk, lower(n.nickname) nick
      from piu_accounts a
      join lateral (select p.nickname from visible_profiles p where p.user_id = a.user_id and p.nickname is not null
                     order by p.taken_at desc limit 1) n on true
     where auth.uid() is not null and a.user_id <> auth.uid()
       and not is_blocked(auth.uid(), a.user_id)
       and length(trim(p_query)) >= 2
       and n.nickname ilike '%' || trim(p_query) || '%'
     order by 2, 3
     limit 12) t
$$;

-- redes sociais: perfil público também mostra as redes abertas para todos (já era assim); seguidores não veem as de "só amigos"

create or replace function public.twitch_live_report(p_lives jsonb, p_checked int default 0, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_new int := 0; v_user uuid;
begin
  for v in select * from jsonb_array_elements(coalesce(p_lives, '[]'::jsonb)) loop
    v_user := (v->>'user')::uuid;
    if exists (select 1 from twitch_lives where stream_id = v->>'id') then
      update twitch_lives set last_seen = now(), title = v->>'title', game = v->>'game', ended_at = null where stream_id = v->>'id';
    else
      insert into twitch_lives (stream_id, user_id, login, title, game, started_at)
      values (v->>'id', v_user, v->>'login', v->>'title', v->>'game', coalesce((v->>'started_at')::timestamptz, now()));
      v_new := v_new + 1;
      -- live que começou há mais de 2 h (ex.: primeira checagem depois de cadastrar) não avisa
      if coalesce((v->>'started_at')::timestamptz, now()) > now() - interval '2 hours' then
        -- amigos e seguidores (seguidor só se o perfil estiver público e as redes abertas para todos)
        insert into notifications (user_id, kind, actor, ref, payload)
        select r.uid, 'friend_live', v_user, v->>'id',
               jsonb_build_object('login', v->>'login', 'title', v->>'title', 'game', v->>'game', 'stream', v->>'id')
          from (
            select case when f.requester = v_user then f.addressee else f.requester end as uid
              from friendships f where f.status = 'accepted' and v_user in (f.requester, f.addressee)
            union
            select fo.follower from follows fo
             where fo.followee = v_user and public.is_public(v_user)
               and exists (select 1 from user_socials s where s.user_id = v_user and s.visibility = 'all')
          ) r
         where not public.is_blocked(r.uid, v_user);
      end if;
    end if;
  end loop;
  update twitch_lives set ended_at = last_seen
   where ended_at is null and stream_id not in (select x->>'id' from jsonb_array_elements(coalesce(p_lives, '[]'::jsonb)) x);
  insert into twitch_check (id, ran_at, live, checked, error) values (1, now(), jsonb_array_length(coalesce(p_lives, '[]'::jsonb)), p_checked, p_error)
  on conflict (id) do update set ran_at = excluded.ran_at, live = excluded.live, checked = excluded.checked, error = excluded.error;
  return jsonb_build_object('new', v_new);
end $$;


create or replace function public.my_notifications()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_seen timestamptz; v_cleared timestamptz; v_base timestamptz; v_items jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select notif_seen_at, notif_cleared_at into v_seen, v_cleared from user_settings where user_id = me;
  v_seen := coalesce(v_seen, now() - interval '7 days');
  v_cleared := coalesce(v_cleared, '-infinity'::timestamptz);
  v_base := greatest((select value::timestamptz from app_secrets where name = 'catalog_baseline'), now() - interval '30 days', v_cleared);

  with stored as (
    select n.payload || jsonb_build_object('kind', n.kind, 'at', n.created_at, 'key', 'n:' || n.id, 'user', n.actor, 'ref', n.ref,
             'nickname', pr.nickname, 'avatar', pr.avatar_url)
             || case when n.kind = 'friend_live' then jsonb_build_object('live_now', exists (select 1 from twitch_lives l where l.stream_id = n.ref and l.ended_at is null)) else '{}'::jsonb end as item,
           n.created_at as at
      from notifications n
      left join lateral (select nickname, avatar_url from visible_profiles p where p.user_id = n.actor
                          order by taken_at desc limit 1) pr on true
     where n.user_id = me and not n.dismissed and n.created_at > now() - interval '60 days'
       and (n.kind <> 'friend_live' or public.toggle_on('twitch_live'))
       and not exists (select 1 from user_blocks b where b.blocker = me and b.blocked = n.actor)
     order by n.created_at desc limit 60
  ), friends as (
    select case when f.requester = me then f.addressee else f.requester end as uid
      from friendships f where f.status = 'accepted' and me in (f.requester, f.addressee)
    union
    -- quem eu sigo (enquanto o perfil dele estiver público)
    select fo.followee from follows fo where fo.follower = me and public.is_public(fo.followee) and not public.is_blocked(me, fo.followee)
  ), first_sync as (
    select h.user_id, min(h.seen_at) + interval '15 minutes' as after
      from visible_score_history h where h.user_id in (select uid from friends) group by h.user_id
  ), hist as (
    select h.*, lag(h.score) over (partition by h.user_id, h.chart_id order by h.seen_at) as prev_score,
           lag(h.grade) over (partition by h.user_id, h.chart_id order by h.seen_at) as prev_grade
      from visible_score_history h where h.user_id in (select uid from friends)
  ), scores as (
    select jsonb_build_object(
             'kind', 'friend_score', 'at', h.seen_at, 'user', h.user_id,
             'key', 'fs:' || h.user_id || ':' || h.chart_id || ':' || extract(epoch from h.seen_at)::bigint,
             'nickname', pr.nickname, 'avatar', pr.avatar_url,
             'chart', h.chart_id, 'song', s.id, 'title', s.title, 'jacket', s.jacket_url,
             'mode', c.mode, 'level', c.level, 'version', c.version,
             'score', h.score, 'grade', h.grade, 'plate', h.plate, 'broken', h.broken,
             'prev_score', h.prev_score, 'prev_grade', h.prev_grade) as item, h.seen_at as at
      from hist h
      join first_sync fs on fs.user_id = h.user_id and h.seen_at > fs.after
      join charts c on c.id = h.chart_id
      join songs s on s.id = c.song_id
      left join lateral (select nickname, avatar_url from visible_profiles p where p.user_id = h.user_id
                          order by taken_at desc limit 1) pr on true
     where h.seen_at > greatest(now() - interval '30 days', v_cleared) and not coalesce(h.broken, false)
       and (h.prev_score is null or h.score > h.prev_score)
     order by h.seen_at desc limit 80
  ), pb as (
    select p.user_id, p.version, p.nickname, p.avatar_url, p.pumbility, p.taken_at,
           lag(p.pumbility) over (partition by p.user_id, p.version order by p.taken_at) as prev
      from visible_profiles p where p.user_id in (select uid from friends) and p.pumbility is not null
  ), pbs as (
    select jsonb_build_object('kind', 'friend_pumbility', 'at', b.taken_at, 'user', b.user_id,
             'key', 'fp:' || b.user_id || ':' || b.version || ':' || extract(epoch from b.taken_at)::bigint,
             'nickname', b.nickname, 'avatar', b.avatar_url, 'version', b.version,
             'pumbility', b.pumbility, 'prev', b.prev) as item, b.taken_at as at
      from pb b
     where public.toggle_on('friend_pumbility') and b.prev is not null and floor(b.pumbility) > floor(b.prev)
       and b.taken_at > greatest(now() - interval '30 days', v_cleared)
     order by b.taken_at desc limit 40
  ), news as (
    select jsonb_build_object('kind', 'new_song', 'at', s.created_at, 'key', 'ns:' || s.id, 'song', s.id, 'title', s.title,
             'artist', s.artist, 'jacket', s.jacket_url,
             'charts', (select jsonb_agg(c.mode || c.level order by c.mode, c.level) from charts c
                         where c.song_id = s.id and c.version = 'phoenix2')) as item, s.created_at as at
      from songs s
     where s.created_at > v_base
       and exists (select 1 from charts c where c.song_id = s.id and c.version = 'phoenix2' and c.from_catalog)
     order by s.created_at desc limit 30
  ), allx as (
    select item, at from stored
    union all select item, at from scores where not exists (select 1 from notif_dismissed d where d.user_id = me and d.key = scores.item->>'key')
    union all select item, at from pbs where not exists (select 1 from notif_dismissed d where d.user_id = me and d.key = pbs.item->>'key')
    union all select item, at from news where not exists (select 1 from notif_dismissed d where d.user_id = me and d.key = news.item->>'key')
  )
  select coalesce(jsonb_agg(item || jsonb_build_object('unread', at > v_seen) order by at desc), '[]'::jsonb)
    into v_items from (select * from allx order by at desc limit 100) z;

  return jsonb_build_object('items', v_items,
    'unread', (select count(*) from jsonb_array_elements(v_items) e where (e->>'unread')::boolean));
end $$;

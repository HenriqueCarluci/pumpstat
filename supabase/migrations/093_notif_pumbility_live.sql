-- Notificações: subidas de PUMBILITY dos amigos e lives da Twitch.
-- Liga/desliga em Administração → Recursos (toggles friend_pumbility e twitch_live; ausente = ligado).

-- ---------- Lives da Twitch ----------
-- Preenchida pela função twitch-live (chave de serviço), que consulta a API da Twitch a cada 2 min.
create table if not exists public.twitch_lives (
  stream_id   text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  login       text not null,
  title       text,
  game        text,
  started_at  timestamptz not null,
  last_seen   timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists twitch_lives_user on public.twitch_lives (user_id, started_at desc);
alter table public.twitch_lives enable row level security;
revoke all on public.twitch_lives from anon, authenticated;

create table if not exists public.twitch_check (id int primary key default 1 check (id = 1), ran_at timestamptz, live int, checked int, error text);
alter table public.twitch_check enable row level security;
revoke all on public.twitch_check from anon, authenticated;

create or replace function public.toggle_on(p_id text) returns boolean language sql stable set search_path = public as $$
  select coalesce((public.app_config()->'toggles'->>p_id)::boolean, true)
$$;

-- logins a consultar: quem preencheu a Twitch e não escondeu as redes
create or replace function public.twitch_logins() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user', s.user_id, 'login', lower(s.twitch))), '[]'::jsonb)
    from user_socials s
   where public.toggle_on('twitch_live') and nullif(trim(s.twitch), '') is not null and s.visibility <> 'hidden'
$$;

-- recebe as lives no ar agora: [{user, login, id, title, game, started_at}]
-- live nova → notificação para os amigos (redes 'friends' ou 'all'); a que sumiu da lista fica encerrada
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
        insert into notifications (user_id, kind, actor, ref, payload)
        select case when f.requester = v_user then f.addressee else f.requester end, 'friend_live', v_user, v->>'id',
               jsonb_build_object('login', v->>'login', 'title', v->>'title', 'game', v->>'game', 'stream', v->>'id')
          from friendships f
         where f.status = 'accepted' and v_user in (f.requester, f.addressee)
           and not exists (select 1 from user_blocks b where b.blocker = case when f.requester = v_user then f.addressee else f.requester end and b.blocked = v_user);
      end if;
    end if;
  end loop;
  update twitch_lives set ended_at = last_seen
   where ended_at is null and stream_id not in (select x->>'id' from jsonb_array_elements(coalesce(p_lives, '[]'::jsonb)) x);
  insert into twitch_check (id, ran_at, live, checked, error) values (1, now(), jsonb_array_length(coalesce(p_lives, '[]'::jsonb)), p_checked, p_error)
  on conflict (id) do update set ran_at = excluded.ran_at, live = excluded.live, checked = excluded.checked, error = excluded.error;
  return jsonb_build_object('new', v_new);
end $$;

-- rodou há menos de 90 s? (a função usa para não chamar a Twitch à toa)
create or replace function public.twitch_check_due() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select ran_at < now() - interval '90 seconds' from twitch_check where id = 1), true)
$$;

revoke all on function public.twitch_logins(), public.twitch_live_report(jsonb, int, text), public.twitch_check_due() from public, anon, authenticated;
grant execute on function public.twitch_logins(), public.twitch_live_report(jsonb, int, text), public.twitch_check_due() to service_role;
grant execute on function public.toggle_on(text) to authenticated, anon;

-- ---------- my_notifications: PUMBILITY dos amigos e lives ----------
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

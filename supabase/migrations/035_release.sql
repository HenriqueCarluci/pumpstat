-- Release: notificações guardadas (e limpar), amigos na fila, sincronização parcial,
-- cadastro de fliperamas e de times com aprovação do admin e votação de tier.

-- =====================================================================
-- Notificações
-- =====================================================================
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  actor uuid references auth.users (id) on delete cascade,
  ref text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  dismissed boolean not null default false
);
create index if not exists notifications_user_time on public.notifications (user_id, created_at desc) where not dismissed;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

alter table public.user_settings add column if not exists notif_cleared_at timestamptz;

create table if not exists public.notif_dismissed (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (length(key) <= 120),
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.notif_dismissed enable row level security;
revoke all on public.notif_dismissed from anon, authenticated;

create or replace function public.notify(p_user uuid, p_kind text, p_actor uuid, p_ref text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, actor, ref, payload)
  select p_user, p_kind, p_actor, p_ref, coalesce(p_payload, '{}'::jsonb)
   where p_user is not null and p_user is distinct from p_actor;
$$;
revoke all on function public.notify(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.notify_admins(p_kind text, p_actor uuid, p_ref text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  select notify(a.user_id, p_kind, p_actor, p_ref, p_payload) from app_admins a;
$$;
revoke all on function public.notify_admins(text, uuid, text, jsonb) from public, anon, authenticated;

-- amizade: pedido, aceite (os dois lados) e pedido recusado/cancelado
create or replace function public.tg_friend_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then perform notify(new.addressee, 'friend_request', new.requester, null); end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'accepted' and old.status is distinct from 'accepted' then
      perform notify(new.requester, 'friend_accepted', new.addressee, null);
      perform notify(new.addressee, 'friend_new', new.requester, null);
      update notifications set dismissed = true
       where user_id = new.addressee and actor = new.requester and kind = 'friend_request' and not dismissed;
    elsif new.status = 'pending' and old.status is distinct from 'pending' then
      perform notify(new.addressee, 'friend_request', new.requester, null);
    end if;
  elsif tg_op = 'DELETE' then
    update notifications set dismissed = true
     where user_id = old.addressee and actor = old.requester and kind = 'friend_request' and not dismissed;
  end if;
  return null;
end $$;
drop trigger if exists friend_notify on public.friendships;
create trigger friend_notify after insert or update or delete on public.friendships
  for each row execute function public.tg_friend_notify();

-- convites para jogar e mensagens (mensagens seguidas da mesma pessoa viram uma notificação só)
create or replace function public.tg_invite_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'message' then
    update notifications
       set payload = jsonb_build_object('message', left(coalesce(new.message, ''), 140), 'count', coalesce((payload->>'count')::int, 1) + 1),
           created_at = now()
     where user_id = new.to_user and actor = new.from_user and kind = 'message' and not dismissed
       and created_at > now() - interval '30 minutes';
    if not found then
      perform notify(new.to_user, 'message', new.from_user, null, jsonb_build_object('message', left(coalesce(new.message, ''), 140), 'count', 1));
    end if;
  else
    perform notify(new.to_user, 'invite', new.from_user, new.venue_slug,
      jsonb_build_object('message', left(coalesce(new.message, ''), 140), 'venue', new.venue_slug,
                         'venue_name', (select name from venues where slug = new.venue_slug)));
  end if;
  return null;
end $$;
drop trigger if exists invite_notify on public.play_invites;
create trigger invite_notify after insert on public.play_invites
  for each row execute function public.tg_invite_notify();

-- histórico: pedidos pendentes e amizades dos últimos 30 dias
insert into notifications (user_id, kind, actor, created_at)
select f.addressee, 'friend_request', f.requester, f.created_at from friendships f
 where f.status = 'pending'
   and not exists (select 1 from notifications n where n.user_id = f.addressee and n.actor = f.requester and n.kind = 'friend_request');
insert into notifications (user_id, kind, actor, created_at)
select f.requester, 'friend_accepted', f.addressee, f.responded_at from friendships f
 where f.status = 'accepted' and f.responded_at > now() - interval '30 days'
   and not exists (select 1 from notifications n where n.user_id = f.requester and n.actor = f.addressee and n.kind = 'friend_accepted');
insert into notifications (user_id, kind, actor, created_at)
select f.addressee, 'friend_new', f.requester, f.responded_at from friendships f
 where f.status = 'accepted' and f.responded_at > now() - interval '30 days'
   and not exists (select 1 from notifications n where n.user_id = f.addressee and n.actor = f.requester and n.kind = 'friend_new');

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
             'nickname', pr.nickname, 'avatar', pr.avatar_url) as item, n.created_at as at
      from notifications n
      left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = n.actor
                          order by taken_at desc limit 1) pr on true
     where n.user_id = me and not n.dismissed and n.created_at > now() - interval '60 days'
       and not exists (select 1 from user_blocks b where b.blocker = me and b.blocked = n.actor)
     order by n.created_at desc limit 60
  ), friends as (
    select case when f.requester = me then f.addressee else f.requester end as uid
      from friendships f where f.status = 'accepted' and me in (f.requester, f.addressee)
  ), first_sync as (
    select h.user_id, min(h.seen_at) + interval '15 minutes' as after
      from user_score_history h where h.user_id in (select uid from friends) group by h.user_id
  ), hist as (
    select h.*, lag(h.score) over (partition by h.user_id, h.chart_id order by h.seen_at) as prev_score,
           lag(h.grade) over (partition by h.user_id, h.chart_id order by h.seen_at) as prev_grade
      from user_score_history h where h.user_id in (select uid from friends)
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
      left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = h.user_id
                          order by taken_at desc limit 1) pr on true
     where h.seen_at > greatest(now() - interval '30 days', v_cleared) and not coalesce(h.broken, false)
       and (h.prev_score is null or h.score > h.prev_score)
     order by h.seen_at desc limit 80
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
    union all select item, at from news where not exists (select 1 from notif_dismissed d where d.user_id = me and d.key = news.item->>'key')
  )
  select coalesce(jsonb_agg(item || jsonb_build_object('unread', at > v_seen) order by at desc), '[]'::jsonb)
    into v_items from (select * from allx order by at desc limit 100) z;

  return jsonb_build_object('items', v_items,
    'unread', (select count(*) from jsonb_array_elements(v_items) e where (e->>'unread')::boolean));
end $$;

create or replace function public.dismiss_notification(p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_key ~ '^n:\d+$' then
    update notifications set dismissed = true where id = substr(p_key, 3)::bigint and user_id = me;
  elsif p_key ~ '^(fs|ns):' then
    insert into notif_dismissed (user_id, key) values (me, left(p_key, 120)) on conflict do nothing;
  end if;
end $$;
revoke all on function public.dismiss_notification(text) from public, anon;
grant execute on function public.dismiss_notification(text) to authenticated;

create or replace function public.clear_notifications()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  update notifications set dismissed = true where user_id = me and not dismissed;
  delete from notif_dismissed where user_id = me;
  insert into user_settings (user_id, notif_seen_at, notif_cleared_at) values (me, now(), now())
  on conflict (user_id) do update set notif_seen_at = now(), notif_cleared_at = now();
end $$;
revoke all on function public.clear_notifications() from public, anon;
grant execute on function public.clear_notifications() to authenticated;

-- =====================================================================
-- Amigos jogando agora (em alguma fila)
-- =====================================================================
create or replace function public.friends_in_queue()
returns jsonb language sql stable security definer set search_path = public as $$
  with friends as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as uid
      from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user', e.user_id, 'nickname', pr.nickname, 'avatar', pr.avatar_url,
           'venue', v.slug, 'venue_name', v.name, 'city', v.city, 'machine', m.name,
           'status', e.status, 'joined_at', e.joined_at,
           'position', (select count(*) from queue_entries e2 where e2.machine_id = e.machine_id and e2.pos < e.pos) + 1,
           'total', (select count(*) from queue_entries e3 where e3.machine_id = e.machine_id))
         order by e.joined_at desc), '[]'::jsonb)
    from queue_entries e
    join friends fr on fr.uid = e.user_id
    join machines m on m.id = e.machine_id
    join venues v on v.id = m.venue_id
    left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = e.user_id
                        order by taken_at desc limit 1) pr on true
   where auth.uid() is not null
     and not exists (select 1 from user_blocks b where (b.blocker = auth.uid() and b.blocked = e.user_id) or (b.blocker = e.user_id and b.blocked = auth.uid()))
$$;
revoke all on function public.friends_in_queue() from public, anon;
grant execute on function public.friends_in_queue() to authenticated;

-- =====================================================================
-- Sincronização parcial: só jogadas recentes; uma jogada passada acima do recorde atualiza o recorde
-- =====================================================================
create or replace function public.ingest_for(p_user uuid, p_payload jsonb, p_source text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_version   text := p_payload->>'version';
  v_partial   boolean := coalesce((p_payload->>'partial')::boolean, false);
  v_item      jsonb;
  v_song_id   bigint;
  v_chart_id  bigint;
  v_old       record;
  v_new_bests int := 0;
  v_new_plays int := 0;
  v_unmatched jsonb := '[]'::jsonb;
  v_rows      int;
  v_kind      text;
  v_broken    boolean;
  v_score     int;
begin
  if v_version not in ('phoenix', 'phoenix2') then
    raise exception 'versão inválida: %', v_version;
  end if;

  foreach v_kind in array array['bests', 'plays'] loop
    for v_item in select * from jsonb_array_elements(coalesce(p_payload->v_kind, '[]'::jsonb)) loop
      v_broken := coalesce((v_item->>'broken')::boolean, false);
      v_song_id := find_song(v_item->>'song');
      if v_song_id is null then
        insert into songs (title, jacket_url) values (v_item->>'song', v_item->>'jacket')
        on conflict (title) do update set jacket_url = coalesce(songs.jacket_url, excluded.jacket_url)
        returning id into v_song_id;
      elsif v_item->>'jacket' is not null then
        update songs set jacket_url = v_item->>'jacket' where id = v_song_id and jacket_url is distinct from v_item->>'jacket';
      end if;

      select id into v_chart_id from charts
       where version = v_version and song_id = v_song_id
         and mode = v_item->>'mode' and level = (v_item->>'level')::int;
      if v_chart_id is null then
        insert into charts (version, song_id, mode, level, from_catalog)
        values (v_version, v_song_id, v_item->>'mode', (v_item->>'level')::int, false)
        returning id into v_chart_id;
        v_unmatched := v_unmatched || jsonb_build_object(
          'song', v_item->>'song', 'mode', v_item->>'mode', 'level', (v_item->>'level')::int);
      end if;

      if v_kind = 'bests' then
        select * into v_old from user_scores where user_id = p_user and chart_id = v_chart_id;
        if not found then
          insert into user_scores (user_id, chart_id, score, grade, plate, broken, achieved_at)
          values (p_user, v_chart_id, (v_item->>'score')::int, v_item->>'grade', v_item->>'plate', v_broken,
                  (v_item->>'achieved_at')::timestamptz);
          insert into user_score_history (user_id, chart_id, score, grade, plate, broken)
          values (p_user, v_chart_id, (v_item->>'score')::int, v_item->>'grade', v_item->>'plate', v_broken);
          v_new_bests := v_new_bests + 1;
        elsif (v_item->>'score')::int <> v_old.score
           or v_old.plate is distinct from v_item->>'plate'
           or v_old.grade is distinct from v_item->>'grade'
           or v_old.broken <> v_broken then
          update user_scores
             set score = (v_item->>'score')::int, grade = v_item->>'grade', plate = v_item->>'plate',
                 broken = v_broken,
                 achieved_at = coalesce((v_item->>'achieved_at')::timestamptz, achieved_at),
                 updated_at = now()
           where user_id = p_user and chart_id = v_chart_id;
          insert into user_score_history (user_id, chart_id, score, grade, plate, broken)
          values (p_user, v_chart_id, (v_item->>'score')::int, v_item->>'grade', v_item->>'plate', v_broken);
          v_new_bests := v_new_bests + 1;
        end if;
      else
        insert into user_plays (user_id, chart_id, score, grade, plate, broken, perfect, great, good, bad, miss, played_at)
        values (p_user, v_chart_id, nullif(v_item->>'score', '')::int, v_item->>'grade', v_item->>'plate', v_broken,
                (v_item->>'perfect')::int, (v_item->>'great')::int, (v_item->>'good')::int,
                (v_item->>'bad')::int, (v_item->>'miss')::int, (v_item->>'played_at')::timestamptz)
        on conflict (user_id, chart_id, played_at) do nothing;
        get diagnostics v_rows = row_count;
        v_new_plays := v_new_plays + v_rows;

        -- parcial: a lista de recordes não foi lida, então uma jogada passada acima do recorde vira o recorde novo
        v_score := nullif(v_item->>'score', '')::int;
        if v_partial and not v_broken and v_score is not null then
          select * into v_old from user_scores where user_id = p_user and chart_id = v_chart_id;
          if not found then
            insert into user_scores (user_id, chart_id, score, grade, plate, broken, achieved_at)
            values (p_user, v_chart_id, v_score, v_item->>'grade', v_item->>'plate', false, (v_item->>'played_at')::timestamptz);
            insert into user_score_history (user_id, chart_id, score, grade, plate, broken)
            values (p_user, v_chart_id, v_score, v_item->>'grade', v_item->>'plate', false);
            v_new_bests := v_new_bests + 1;
          elsif v_old.broken or v_score > v_old.score then
            update user_scores
               set score = v_score, grade = v_item->>'grade', plate = coalesce(v_item->>'plate', plate), broken = false,
                   achieved_at = coalesce((v_item->>'played_at')::timestamptz, achieved_at), updated_at = now()
             where user_id = p_user and chart_id = v_chart_id;
            insert into user_score_history (user_id, chart_id, score, grade, plate, broken)
            values (p_user, v_chart_id, v_score, v_item->>'grade', coalesce(v_item->>'plate', v_old.plate), false);
            v_new_bests := v_new_bests + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  if p_payload ? 'profile' then
    insert into user_profiles (user_id, version, nickname, title, avatar_url, pumbility, best_count)
    values (p_user, v_version, p_payload->'profile'->>'nickname', p_payload->'profile'->>'title',
            p_payload->'profile'->>'avatar_url', nullif(p_payload->'profile'->>'pumbility', '')::numeric,
            case when v_partial
                 then (select count(*) from user_scores s join charts c on c.id = s.chart_id where s.user_id = p_user and c.version = v_version)
                 else jsonb_array_length(coalesce(p_payload->'bests', '[]'::jsonb)) end);
    insert into piu_accounts (user_id, game_id) values (p_user, p_payload->'profile'->>'nickname')
    on conflict (user_id) do update set game_id = coalesce(excluded.game_id, piu_accounts.game_id), last_sync_at = now();
  end if;

  insert into user_syncs (user_id, version, source, best_count, play_count, new_bests, new_plays, unmatched)
  values (p_user, v_version, case when v_partial then p_source || ':recent' else p_source end,
          jsonb_array_length(coalesce(p_payload->'bests', '[]'::jsonb)),
          jsonb_array_length(coalesce(p_payload->'plays', '[]'::jsonb)), v_new_bests, v_new_plays, v_unmatched);

  return jsonb_build_object('ok', true, 'version', v_version, 'new_bests', v_new_bests,
                            'new_plays', v_new_plays, 'unmatched', v_unmatched, 'partial', v_partial);
end;
$function$;

-- =====================================================================
-- Cadastro de fliperamas pelos membros (aprovação do admin)
-- =====================================================================
create table if not exists public.venue_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  city text not null check (length(city) between 2 and 60),
  address text check (length(address) <= 200),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  machines int not null default 1 check (machines between 1 and 20),
  machine_names text check (length(machine_names) <= 300),
  note text check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text check (length(admin_note) <= 300),
  venue_id bigint references public.venues (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);
alter table public.venue_requests enable row level security;
revoke all on public.venue_requests from anon, authenticated;

create or replace function public.slugify(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.request_venue(p_name text, p_city text, p_address text, p_lat double precision, p_lng double precision,
  p_machines int, p_machine_names text, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id bigint;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if (select count(*) from venue_requests where user_id = me and status = 'pending') >= 3 then
    raise exception 'Você já tem 3 pedidos esperando aprovação.';
  end if;
  insert into venue_requests (user_id, name, city, address, latitude, longitude, machines, machine_names, note)
  values (me, trim(p_name), trim(p_city), nullif(trim(p_address), ''), p_lat, p_lng, greatest(1, least(coalesce(p_machines, 1), 20)),
          nullif(trim(p_machine_names), ''), nullif(trim(p_note), ''))
  returning id into v_id;
  perform notify_admins('admin_venue_request', me, v_id::text, jsonb_build_object('name', trim(p_name), 'city', trim(p_city)));
  return v_id;
end $$;
revoke all on function public.request_venue(text, text, text, double precision, double precision, int, text, text) from public, anon;
grant execute on function public.request_venue(text, text, text, double precision, double precision, int, text, text) to authenticated;

create or replace function public.my_venue_requests()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'city', r.city, 'status', r.status,
           'admin_note', r.admin_note, 'created_at', r.created_at, 'venue', v.slug) order by r.created_at desc), '[]'::jsonb)
    from venue_requests r left join venues v on v.id = r.venue_id
   where r.user_id = auth.uid()
$$;
revoke all on function public.my_venue_requests() from public, anon;
grant execute on function public.my_venue_requests() to authenticated;

create or replace function public.admin_venue_requests(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('nickname', pr.nickname) order by r.created_at desc)
    from venue_requests r
    left join lateral (select nickname from user_profiles p where p.user_id = r.user_id order by taken_at desc limit 1) pr on true
   where p_status is null or r.status = p_status), '[]'::jsonb);
end $$;
revoke all on function public.admin_venue_requests(text) from public, anon;
grant execute on function public.admin_venue_requests(text) to authenticated;

create or replace function public.admin_review_venue(p_id bigint, p_approve boolean, p_name text, p_city text, p_address text,
  p_lat double precision, p_lng double precision, p_machines int, p_machine_names text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r venue_requests; v_slug text; v_base text; v_n int := 1; v_venue bigint; v_names text[]; i int;
begin
  perform admin_guard();
  select * into r from venue_requests where id = p_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if r.status <> 'pending' then raise exception 'este pedido já foi analisado'; end if;
  if not p_approve then
    update venue_requests set status = 'rejected', admin_note = nullif(trim(p_note), ''), reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    perform notify(r.user_id, 'venue_rejected', auth.uid(), p_id::text, jsonb_build_object('name', r.name, 'note', nullif(trim(p_note), '')));
    return jsonb_build_object('ok', true);
  end if;
  if p_lat is null or p_lng is null then raise exception 'Informe a localização (latitude e longitude) do fliperama.'; end if;
  v_base := nullif(slugify(coalesce(nullif(trim(p_name), ''), r.name)), '');
  v_base := coalesce(v_base, 'fliperama');
  v_slug := v_base;
  while exists (select 1 from venues where slug = v_slug) loop v_n := v_n + 1; v_slug := v_base || '-' || v_n; end loop;
  insert into venues (slug, name, city, created_by, address, latitude, longitude, radius_m, require_checkin, sort, source)
  values (v_slug, coalesce(nullif(trim(p_name), ''), r.name), coalesce(nullif(trim(p_city), ''), r.city), r.user_id,
          coalesce(nullif(trim(p_address), ''), r.address), p_lat, p_lng, 250, true,
          coalesce((select max(sort) from venues), 0) + 1, 'member:' || r.id)
  returning id into v_venue;
  v_names := array_remove(regexp_split_to_array(coalesce(nullif(trim(p_machine_names), ''), r.machine_names, ''), '\s*[,;\n]\s*'), '');
  for i in 1 .. greatest(1, least(coalesce(p_machines, r.machines, 1), 20)) loop
    insert into machines (venue_id, name, sort, active)
    values (v_venue, coalesce(v_names[i], case when coalesce(p_machines, r.machines, 1) = 1 then 'Pump' else 'Pump ' || i end), i, true);
  end loop;
  update venue_requests set status = 'approved', venue_id = v_venue, admin_note = nullif(trim(p_note), ''), reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  perform notify(r.user_id, 'venue_approved', auth.uid(), v_slug, jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), r.name), 'venue', v_slug));
  return jsonb_build_object('ok', true, 'slug', v_slug);
end $$;
revoke all on function public.admin_review_venue(bigint, boolean, text, text, text, double precision, double precision, int, text, text) from public, anon;
grant execute on function public.admin_review_venue(bigint, boolean, text, text, text, double precision, double precision, int, text, text) to authenticated;

-- =====================================================================
-- Times (aprovação do admin)
-- =====================================================================
create table if not exists public.teams (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 2 and 40),
  tag text check (tag ~ '^[A-Za-z0-9]{2,5}$'),
  city text check (length(city) <= 60),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references auth.users (id) on delete set null,
  admin_note text check (length(admin_note) <= 300),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists teams_name_unique on public.teams (lower(name)) where status <> 'rejected';
alter table public.teams enable row level security;
revoke all on public.teams from anon, authenticated;

create table if not exists public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists team_members_team on public.team_members (team_id);
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;

create or replace function public.list_teams()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city,
               'members', (select count(*) from team_members m where m.team_id = t.id)) order by lower(t.name))
             from teams t where t.status = 'approved'), '[]'::jsonb),
    'mine', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag) from team_members m join teams t on t.id = m.team_id
              where m.user_id = auth.uid()),
    'pending', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'status', t.status, 'admin_note', t.admin_note)
                  from teams t where t.created_by = auth.uid() and (t.status = 'pending' or (t.status = 'rejected' and t.reviewed_at > now() - interval '14 days'))
                 order by t.created_at desc limit 1))
$$;
revoke all on function public.list_teams() from public, anon;
grant execute on function public.list_teams() to authenticated;

create or replace function public.request_team(p_name text, p_tag text, p_city text)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id bigint;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if exists (select 1 from teams where created_by = me and status = 'pending') then
    raise exception 'Você já tem um pedido de time esperando aprovação.';
  end if;
  if exists (select 1 from teams where lower(name) = lower(trim(p_name)) and status <> 'rejected') then
    raise exception 'Já existe um time com esse nome.';
  end if;
  insert into teams (name, tag, city, created_by) values (trim(p_name), nullif(upper(trim(p_tag)), ''), nullif(trim(p_city), ''), me)
  returning id into v_id;
  perform notify_admins('admin_team_request', me, v_id::text, jsonb_build_object('name', trim(p_name)));
  return v_id;
end $$;
revoke all on function public.request_team(text, text, text) from public, anon;
grant execute on function public.request_team(text, text, text) to authenticated;

create or replace function public.set_my_team(p_team bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_team is null then delete from team_members where user_id = me; return; end if;
  if not exists (select 1 from teams where id = p_team and status = 'approved') then raise exception 'time não encontrado'; end if;
  insert into team_members (user_id, team_id) values (me, p_team)
  on conflict (user_id) do update set team_id = excluded.team_id, joined_at = now();
end $$;
revoke all on function public.set_my_team(bigint) from public, anon;
grant execute on function public.set_my_team(bigint) to authenticated;

create or replace function public.teams_of(p_users uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(m.user_id, jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag)), '{}'::jsonb)
    from team_members m join teams t on t.id = m.team_id and t.status = 'approved'
   where m.user_id = any(p_users[1:300]) and auth.uid() is not null
$$;
revoke all on function public.teams_of(uuid[]) from public, anon;
grant execute on function public.teams_of(uuid[]) to authenticated;

create or replace function public.admin_teams(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('nickname', pr.nickname,
            'members', (select count(*) from team_members m where m.team_id = t.id)) order by t.created_at desc)
    from teams t
    left join lateral (select nickname from user_profiles p where p.user_id = t.created_by order by taken_at desc limit 1) pr on true
   where p_status is null or t.status = p_status), '[]'::jsonb);
end $$;
revoke all on function public.admin_teams(text) from public, anon;
grant execute on function public.admin_teams(text) to authenticated;

create or replace function public.admin_review_team(p_id bigint, p_approve boolean, p_name text, p_tag text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare t teams;
begin
  perform admin_guard();
  select * into t from teams where id = p_id for update;
  if not found then raise exception 'time não encontrado'; end if;
  if p_approve then
    update teams set status = 'approved', name = coalesce(nullif(trim(p_name), ''), name),
           tag = coalesce(nullif(upper(trim(p_tag)), ''), tag), admin_note = nullif(trim(p_note), ''), reviewed_at = now()
     where id = p_id;
    if t.created_by is not null then
      insert into team_members (user_id, team_id) values (t.created_by, p_id) on conflict (user_id) do nothing;
      perform notify(t.created_by, 'team_approved', auth.uid(), p_id::text, jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), t.name)));
    end if;
  else
    update teams set status = 'rejected', admin_note = nullif(trim(p_note), ''), reviewed_at = now() where id = p_id;
    delete from team_members where team_id = p_id;
    perform notify(t.created_by, 'team_rejected', auth.uid(), p_id::text, jsonb_build_object('name', t.name, 'note', nullif(trim(p_note), '')));
  end if;
end $$;
revoke all on function public.admin_review_team(bigint, boolean, text, text, text) from public, anon;
grant execute on function public.admin_review_team(bigint, boolean, text, text, text) to authenticated;

-- =====================================================================
-- Votação de tier: quem passou o chart propõe; após X horas, se a maioria concordar, o tier do clube muda
-- =====================================================================
create table if not exists public.tier_proposals (
  id bigint generated always as identity primary key,
  chart_id bigint not null references public.charts (id) on delete cascade,
  proposer uuid references auth.users (id) on delete set null,
  from_tier smallint check (from_tier between -2 and 2),
  to_tier smallint not null check (to_tier between -2 and 2),
  reason text check (length(reason) <= 300),
  created_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  yes int not null default 0,
  no int not null default 0,
  closed_at timestamptz
);
create unique index if not exists tier_proposals_one_open on public.tier_proposals (chart_id) where status = 'open';
alter table public.tier_proposals enable row level security;
revoke all on public.tier_proposals from anon, authenticated;

create table if not exists public.tier_votes (
  proposal_id bigint not null references public.tier_proposals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  agree boolean not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);
alter table public.tier_votes enable row level security;
revoke all on public.tier_votes from anon, authenticated;

create or replace function public.has_cleared(p_user uuid, p_chart bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_scores where user_id = p_user and chart_id = p_chart and not broken)
$$;
revoke all on function public.has_cleared(uuid, bigint) from public, anon, authenticated;

-- encerra uma votação: aplica o tier do clube se aprovada e avisa quem propôs e quem votou
create or replace function public.finish_tier_proposal(p_id bigint, p_ok boolean, p_by_admin boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare p tier_proposals; v_info jsonb;
begin
  update tier_proposals set status = case when p_ok then 'approved' else 'rejected' end, closed_at = now()
   where id = p_id and status = 'open' returning * into p;
  if not found then return; end if;
  if p_ok then
    insert into chart_tier_overrides (chart_id, tier, note, set_by)
    values (p.chart_id, p.to_tier, case when p_by_admin then 'votação (aprovada pelo admin)' else 'votação da comunidade' end, p.proposer)
    on conflict (chart_id) do update set tier = excluded.tier, note = excluded.note, set_by = excluded.set_by, updated_at = now();
  end if;
  select jsonb_build_object('song', s.id, 'title', s.title, 'mode', c.mode, 'level', c.level, 'to', p.to_tier,
                            'result', case when p_ok then 'approved' else 'rejected' end, 'yes', p.yes, 'no', p.no, 'admin', p_by_admin)
    into v_info from charts c join songs s on s.id = c.song_id where c.id = p.chart_id;
  perform notify(u.uid, 'tier_vote_result', null, p.id::text, v_info)
     from (select p.proposer as uid union select user_id from tier_votes where proposal_id = p.id) u;
end $$;
revoke all on function public.finish_tier_proposal(bigint, boolean, boolean) from public, anon, authenticated;

create or replace function public.close_due_tier_proposals()
returns int language plpgsql security definer set search_path = public as $$
declare p record; v_min int := coalesce((app_config()->'community'->>'tier_vote_min')::int, 3); n int := 0;
begin
  for p in select id, yes, no from tier_proposals where status = 'open' and closes_at <= now() for update skip locked loop
    perform finish_tier_proposal(p.id, p.yes > p.no and p.yes + p.no >= v_min);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.close_due_tier_proposals() from public, anon;
grant execute on function public.close_due_tier_proposals() to authenticated;

create or replace function public.propose_tier(p_chart bigint, p_to smallint, p_from smallint, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id bigint; v_hours int := coalesce((app_config()->'community'->>'tier_vote_hours')::int, 48); v_info jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  perform close_due_tier_proposals();
  if not has_cleared(me, p_chart) then raise exception 'Só quem passou o chart pode propor mudança de tier.'; end if;
  if p_to is null or p_to not between -2 and 2 then raise exception 'tier inválido'; end if;
  if p_from is not null and p_from = p_to then raise exception 'Escolha um tier diferente do atual.'; end if;
  if exists (select 1 from tier_proposals where chart_id = p_chart and status = 'open') then
    raise exception 'Já existe uma votação aberta para este chart.';
  end if;
  if (select count(*) from tier_proposals where proposer = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Limite de 10 propostas por dia.';
  end if;
  insert into tier_proposals (chart_id, proposer, from_tier, to_tier, reason, closes_at, yes)
  values (p_chart, me, p_from, p_to, nullif(trim(p_reason), ''), now() + make_interval(hours => greatest(1, least(v_hours, 336))), 1)
  returning id into v_id;
  insert into tier_votes (proposal_id, user_id, agree) values (v_id, me, true);
  -- avisa quem já avaliou esse chart
  select jsonb_build_object('song', s.id, 'title', s.title, 'mode', c.mode, 'level', c.level, 'to', p_to)
    into v_info from charts c join songs s on s.id = c.song_id where c.id = p_chart;
  perform notify(r.user_id, 'tier_vote_open', me, v_id::text, v_info) from chart_reviews r where r.chart_id = p_chart and r.user_id <> me;
  return v_id;
end $$;
revoke all on function public.propose_tier(bigint, smallint, smallint, text) from public, anon;
grant execute on function public.propose_tier(bigint, smallint, smallint, text) to authenticated;

create or replace function public.vote_tier(p_id bigint, p_agree boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p tier_proposals;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  perform close_due_tier_proposals();
  select * into p from tier_proposals where id = p_id;
  if not found or p.status <> 'open' then raise exception 'Esta votação já foi encerrada.'; end if;
  if not has_cleared(me, p.chart_id) then raise exception 'Só quem passou o chart pode votar.'; end if;
  insert into tier_votes (proposal_id, user_id, agree) values (p_id, me, p_agree)
  on conflict (proposal_id, user_id) do update set agree = excluded.agree, created_at = now();
  update tier_proposals set yes = (select count(*) from tier_votes where proposal_id = p_id and agree),
                            no = (select count(*) from tier_votes where proposal_id = p_id and not agree)
   where id = p_id returning * into p;
  return jsonb_build_object('yes', p.yes, 'no', p.no);
end $$;
revoke all on function public.vote_tier(bigint, boolean) from public, anon;
grant execute on function public.vote_tier(bigint, boolean) to authenticated;

-- votações abertas (e as encerradas nos últimos 7 dias), com o voto de quem pergunta; p_charts filtra
create or replace function public.tier_proposals_list(p_charts bigint[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform close_due_tier_proposals();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'chart', p.chart_id, 'song', s.id, 'title', s.title, 'jacket', s.jacket_url, 'mode', c.mode, 'level', c.level,
      'version', c.version, 'from', p.from_tier, 'to', p.to_tier, 'reason', p.reason, 'status', p.status,
      'yes', p.yes, 'no', p.no, 'closes_at', p.closes_at, 'created_at', p.created_at,
      'proposer', pr.nickname, 'mine', p.proposer = auth.uid(),
      'my_vote', (select agree from tier_votes v where v.proposal_id = p.id and v.user_id = auth.uid()),
      'can_vote', p.status = 'open' and has_cleared(auth.uid(), p.chart_id))
      order by (p.status = 'open') desc, p.closes_at)
    from tier_proposals p
    join charts c on c.id = p.chart_id join songs s on s.id = c.song_id
    left join lateral (select nickname from user_profiles u where u.user_id = p.proposer order by taken_at desc limit 1) pr on true
   where (p_charts is null or p.chart_id = any(p_charts))
     and (p.status = 'open' or p.closed_at > now() - interval '7 days')), '[]'::jsonb);
end $$;
revoke all on function public.tier_proposals_list(bigint[]) from public, anon;
grant execute on function public.tier_proposals_list(bigint[]) to authenticated;

-- admin encerra na hora (aprova ou recusa), sem mexer nos votos
create or replace function public.admin_close_tier(p_id bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  perform finish_tier_proposal(p_id, p_approve, true);
end $$;
revoke all on function public.admin_close_tier(bigint, boolean) from public, anon;
grant execute on function public.admin_close_tier(bigint, boolean) to authenticated;

-- configuração padrão da votação (o admin muda em Administração → Planos/Comunidade)
update public.app_settings set value = value || jsonb_build_object('community', jsonb_build_object('tier_vote_hours', 48, 'tier_vote_min', 3))
 where key = 'plans' and not (value ? 'community');

-- =====================================================================
-- Notas dos amigos em todos os charts de uma música (para comparar na página da música)
-- =====================================================================
create or replace function public.song_friend_scores(p_song bigint, p_version text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('chart', s.chart_id, 'user', s.user_id, 'score', s.score, 'grade', s.grade,
           'plate', s.plate, 'broken', s.broken, 'nickname', pr.nickname, 'avatar', pr.avatar_url)
         order by s.chart_id, s.broken, s.score desc), '[]'::jsonb)
    from user_scores s
    join charts c on c.id = s.chart_id and c.song_id = p_song and c.version = p_version
    left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = s.user_id order by taken_at desc limit 1) pr on true
   where auth.uid() is not null and s.user_id <> auth.uid() and are_friends(auth.uid(), s.user_id)
     and not exists (select 1 from user_blocks b where (b.blocker = auth.uid() and b.blocked = s.user_id) or (b.blocker = s.user_id and b.blocked = auth.uid()))
$$;
revoke all on function public.song_friend_scores(bigint, text) from public, anon;
grant execute on function public.song_friend_scores(bigint, text) to authenticated;

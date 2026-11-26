-- 021: estilo dos charts (% por padrão, a partir do piucenter), notificações e refresh do catálogo

-- ---------- estilo dos charts ----------
create table if not exists public.chart_styles (
  song_id    bigint not null references public.songs(id) on delete cascade,
  mode       text   not null check (mode in ('S', 'D')),
  level      int    not null,
  pc_name    text,               -- id do chart no piucenter
  notes      int,
  nps        numeric,
  bpm_info   text,
  tags       text[] default '{}', -- 3 skills principais segundo o piucenter
  twist numeric, drill numeric, run numeric, bracket numeric, jump numeric,
  doublestep numeric, jack numeric, footswitch numeric,
  updated_at timestamptz not null default now(),
  primary key (song_id, mode, level)
);
alter table public.chart_styles enable row level security;
drop policy if exists "leitura publica" on public.chart_styles;
create policy "leitura publica" on public.chart_styles for select to anon, authenticated using (true);
revoke insert, update, delete on public.chart_styles from anon, authenticated;

-- linhas: [pc_name, title, mode, level, songtype, nps, bpm_info, tags[], pct[8], notes]
create or replace function public.import_chart_styles(p_key text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_song bigint; v_ok int := 0; v_miss int := 0; p jsonb; v_title text;
begin
  if p_key is null or p_key <> (select value from app_secrets where name = 'ingest_key') then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    p := r->8;
    if p is null or jsonb_typeof(p) <> 'array' then v_miss := v_miss + 1; continue; end if;
    v_title := r->>1;
    v_title := case upper(coalesce(r->>4, ''))
      when 'SHORTCUT' then case when v_title ilike '%short cut%' then v_title else v_title || ' - SHORT CUT -' end
      when 'FULLSONG' then case when v_title ilike '%full song%' then v_title else v_title || ' - FULL SONG -' end
      else v_title end;
    v_song := find_song(v_title);
    if v_song is null then v_miss := v_miss + 1; continue; end if;
    insert into chart_styles (song_id, mode, level, pc_name, notes, nps, bpm_info, tags,
                              twist, drill, run, bracket, jump, doublestep, jack, footswitch, updated_at)
    values (v_song, r->>2, (r->>3)::int, r->>0, nullif(r->>9, '')::int, nullif(r->>5, '')::numeric, r->>6,
            coalesce(array(select jsonb_array_elements_text(r->7)), '{}'),
            (p->>0)::numeric, (p->>1)::numeric, (p->>2)::numeric, (p->>3)::numeric,
            (p->>4)::numeric, (p->>5)::numeric, (p->>6)::numeric, (p->>7)::numeric, now())
    on conflict (song_id, mode, level) do update set
      pc_name = excluded.pc_name, notes = excluded.notes, nps = excluded.nps, bpm_info = excluded.bpm_info,
      tags = excluded.tags, twist = excluded.twist, drill = excluded.drill, run = excluded.run,
      bracket = excluded.bracket, jump = excluded.jump, doublestep = excluded.doublestep,
      jack = excluded.jack, footswitch = excluded.footswitch, updated_at = now();
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('ok', v_ok, 'miss', v_miss);
end $$;
revoke all on function public.import_chart_styles(text, jsonb) from public;
grant execute on function public.import_chart_styles(text, jsonb) to anon, authenticated;

-- estilos das músicas pedidas: [[song_id, mode, level, nps, bpm_info, tags, [8 %], notes], ...]
create or replace function public.song_styles(p_songs bigint[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(song_id, mode, level, nps, bpm_info, tags,
           jsonb_build_array(twist, drill, run, bracket, jump, doublestep, jack, footswitch), notes)), '[]'::jsonb)
    from chart_styles where song_id = any(p_songs)
$$;
grant execute on function public.song_styles(bigint[]) to anon, authenticated;

-- ---------- notificações ----------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notif_seen_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "dono" on public.user_settings;
create policy "dono" on public.user_settings for select to authenticated using (user_id = auth.uid());

-- músicas criadas antes disto são o catálogo inicial (não viram "lançamento")
insert into public.app_secrets (name, value) values ('catalog_baseline', now()::text)
on conflict (name) do nothing;

create or replace function public.my_notifications()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_seen timestamptz; v_base timestamptz; v_items jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select notif_seen_at into v_seen from user_settings where user_id = me;
  v_seen := coalesce(v_seen, now() - interval '7 days');
  v_base := greatest((select value::timestamptz from app_secrets where name = 'catalog_baseline'), now() - interval '30 days');

  with friends as (
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
     where h.seen_at > now() - interval '30 days' and not coalesce(h.broken, false)
       and (h.prev_score is null or h.score > h.prev_score)
     order by h.seen_at desc limit 80
  ), news as (
    select jsonb_build_object('kind', 'new_song', 'at', s.created_at, 'song', s.id, 'title', s.title,
             'artist', s.artist, 'jacket', s.jacket_url,
             'charts', (select jsonb_agg(c.mode || c.level order by c.mode, c.level) from charts c
                         where c.song_id = s.id and c.version = 'phoenix2')) as item, s.created_at as at
      from songs s
     where s.created_at > v_base
       and exists (select 1 from charts c where c.song_id = s.id and c.version = 'phoenix2' and c.from_catalog)
     order by s.created_at desc limit 30
  ), reqs as (
    select jsonb_build_object('kind', case when f.addressee = me then 'friend_request' else 'friend_accepted' end,
             'at', coalesce(f.responded_at, f.created_at), 'user', o.uid,
             'nickname', pr.nickname, 'avatar', pr.avatar_url) as item,
           coalesce(f.responded_at, f.created_at) as at
      from friendships f
      cross join lateral (select case when f.requester = me then f.addressee else f.requester end as uid) o
      left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = o.uid
                          order by taken_at desc limit 1) pr on true
     where (f.addressee = me and f.status = 'pending')
        or (f.requester = me and f.status = 'accepted' and f.responded_at > now() - interval '30 days')
  ), allx as (
    select item, at from scores union all select item, at from news union all select item, at from reqs
  )
  select coalesce(jsonb_agg(item || jsonb_build_object('unread', at > v_seen) order by at desc), '[]'::jsonb)
    into v_items from (select * from allx order by at desc limit 100) z;

  return jsonb_build_object('items', v_items,
    'unread', (select count(*) from jsonb_array_elements(v_items) e where (e->>'unread')::boolean));
end $$;
revoke all on function public.my_notifications() from public, anon;
grant execute on function public.my_notifications() to authenticated;

create or replace function public.mark_notifications_seen()
returns void language sql security definer set search_path = public as $$
  insert into user_settings (user_id, notif_seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set notif_seen_at = now();
$$;
revoke all on function public.mark_notifications_seen() from public, anon;
grant execute on function public.mark_notifications_seen() to authenticated;

-- Half-Double (charts do R!SE na Phoenix 2) e marca de música do R!SE.
alter table public.charts drop constraint if exists charts_mode_check;
alter table public.charts add constraint charts_mode_check check (mode in ('S', 'D', 'C', 'HD'));

-- música que só abre com o PUMP IT UP R!SE (Steam) ligado ao AM.PASS
alter table public.songs add column if not exists rise boolean not null default false;
update public.songs set rise = true where title = 'Rise Up (feat. Miori Celesta)';

create or replace function public.app_data(p_version text)
 returns jsonb language sql stable set search_path to 'public' as $function$
  with mine as (
    select s.chart_id, s.score, s.grade, s.plate, s.achieved_at, s.broken, c.piuscores_id, c.version
      from user_scores s join charts c on c.id = s.chart_id
     where s.user_id = (select auth.uid())
  ),
  other as (
    select distinct on (piuscores_id) piuscores_id, score, grade, plate
      from mine
     where piuscores_id is not null and version <> p_version
     order by piuscores_id, score desc
  )
  select jsonb_build_object(
    'version', p_version,
    'songs', (
      select coalesce(jsonb_agg(jsonb_build_array(s.id, s.title, s.artist, s.bpm, s.song_type, s.jacket_url, s.rise)), '[]'::jsonb)
        from songs s
       where exists (select 1 from charts c where c.song_id = s.id and c.version = p_version)
    ),
    'charts', (
      select coalesce(jsonb_agg(jsonb_build_array(
               c.id, c.song_id, c.mode, c.level, c.step_artist, c.note_count, c.skills,
               c.pass_difficulty, c.score_difficulty, c.scoring_level,
               b.score, b.grade, b.plate, b.achieved_at,
               o.score, o.grade, o.plate, b.broken) order by c.id), '[]'::jsonb)
        from charts c
        left join mine b on b.chart_id = c.id
        left join other o on o.piuscores_id = c.piuscores_id
       where c.version = p_version
    ),
    'profile', (
      select to_jsonb(p) from user_profiles p
       where p.user_id = (select auth.uid()) and p.version = p_version order by p.taken_at desc limit 1
    ),
    'plays', (
      select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.score, x.grade, x.plate,
               x.perfect, x.great, x.good, x.bad, x.miss, x.played_at, x.broken) order by x.played_at desc), '[]'::jsonb)
        from (select pl.* from user_plays pl join charts c on c.id = pl.chart_id
               where pl.user_id = (select auth.uid()) and c.version = p_version order by pl.played_at desc limit 300) x
    ),
    'last_sync', (select max(started_at) from user_syncs where user_id = (select auth.uid()) and version = p_version),
    'pumbility_history', (
      select coalesce(jsonb_agg(jsonb_build_array(taken_at, pumbility) order by taken_at), '[]'::jsonb)
        from user_profiles where user_id = (select auth.uid()) and version = p_version and pumbility is not null
    )
  )
$function$;

create or replace function public.admin_set_song_rise(p_song bigint, p_rise boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update songs set rise = coalesce(p_rise, false) where id = p_song;
  if not found then raise exception 'música não encontrada'; end if;
end $$;
revoke all on function public.admin_set_song_rise(bigint, boolean) from public, anon;
grant execute on function public.admin_set_song_rise(bigint, boolean) to authenticated;

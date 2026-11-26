-- PumpStat — funções de ingestão e leitura

-- Grava o resultado do coletor (bookmarklet). Protegida pela chave em app_secrets.
create or replace function public.ingest(p_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version   text := p_payload->>'version';
  v_item      jsonb;
  v_song_id   bigint;
  v_chart_id  bigint;
  v_old       record;
  v_new_bests int := 0;
  v_new_plays int := 0;
  v_unmatched jsonb := '[]'::jsonb;
  v_rows      int;
  v_kind      text;
begin
  if p_key is null or p_key <> (select value from app_secrets where name = 'ingest_key') then
    raise exception 'chave de ingestão inválida' using errcode = '28000';
  end if;
  if v_version not in ('phoenix', 'phoenix2') then
    raise exception 'versão inválida: %', v_version;
  end if;

  foreach v_kind in array array['bests', 'plays'] loop
    for v_item in select * from jsonb_array_elements(coalesce(p_payload->v_kind, '[]'::jsonb)) loop
      -- música: título exato, depois título normalizado
      select id into v_song_id from songs where title = v_item->>'song';
      if v_song_id is null then
        select id into v_song_id from songs where title_key = title_key(v_item->>'song') order by id limit 1;
      end if;
      if v_song_id is null then
        insert into songs (title, jacket_url) values (v_item->>'song', v_item->>'jacket')
        on conflict (title) do update set jacket_url = coalesce(songs.jacket_url, excluded.jacket_url)
        returning id into v_song_id;
      elsif v_item->>'jacket' is not null then
        update songs set jacket_url = v_item->>'jacket' where id = v_song_id and jacket_url is distinct from v_item->>'jacket';
      end if;

      -- chart
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
        select * into v_old from best_scores where chart_id = v_chart_id;
        if not found then
          insert into best_scores (chart_id, score, grade, plate, achieved_at)
          values (v_chart_id, (v_item->>'score')::int, v_item->>'grade', v_item->>'plate',
                  (v_item->>'achieved_at')::timestamptz);
          insert into best_score_history (chart_id, score, grade, plate)
          values (v_chart_id, (v_item->>'score')::int, v_item->>'grade', v_item->>'plate');
          v_new_bests := v_new_bests + 1;
        elsif (v_item->>'score')::int > v_old.score
           or v_old.plate is distinct from v_item->>'plate'
           or v_old.grade is distinct from v_item->>'grade' then
          update best_scores
             set score = greatest(score, (v_item->>'score')::int),
                 grade = v_item->>'grade',
                 plate = v_item->>'plate',
                 achieved_at = coalesce((v_item->>'achieved_at')::timestamptz, achieved_at),
                 updated_at = now()
           where chart_id = v_chart_id;
          insert into best_score_history (chart_id, score, grade, plate)
          values (v_chart_id, (v_item->>'score')::int, v_item->>'grade', v_item->>'plate');
          v_new_bests := v_new_bests + 1;
        end if;
      else
        insert into plays (chart_id, score, grade, plate, perfect, great, good, bad, miss, played_at)
        values (v_chart_id, nullif(v_item->>'score', '')::int, v_item->>'grade', v_item->>'plate',
                (v_item->>'perfect')::int, (v_item->>'great')::int, (v_item->>'good')::int,
                (v_item->>'bad')::int, (v_item->>'miss')::int, (v_item->>'played_at')::timestamptz)
        on conflict (chart_id, played_at) do nothing;
        get diagnostics v_rows = row_count;
        v_new_plays := v_new_plays + v_rows;
      end if;
    end loop;
  end loop;

  if p_payload ? 'profile' then
    insert into player_snapshots (version, nickname, title, avatar_url, pumbility, best_count)
    values (v_version, p_payload->'profile'->>'nickname', p_payload->'profile'->>'title',
            p_payload->'profile'->>'avatar_url', nullif(p_payload->'profile'->>'pumbility', '')::numeric,
            jsonb_array_length(coalesce(p_payload->'bests', '[]'::jsonb)));
  end if;

  insert into sync_runs (version, best_count, play_count, new_bests, new_plays, unmatched)
  values (v_version, jsonb_array_length(coalesce(p_payload->'bests', '[]'::jsonb)),
          jsonb_array_length(coalesce(p_payload->'plays', '[]'::jsonb)), v_new_bests, v_new_plays, v_unmatched);

  return jsonb_build_object('ok', true, 'version', v_version, 'new_bests', v_new_bests,
                            'new_plays', v_new_plays, 'unmatched', v_unmatched);
end;
$$;

revoke all on function public.ingest(text, jsonb) from public;
grant execute on function public.ingest(text, jsonb) to anon, authenticated;

-- Tudo que o app precisa para uma versão, num único JSON compacto.
create or replace function public.app_data(p_version text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'version', p_version,
    'songs', (
      select coalesce(jsonb_agg(jsonb_build_array(s.id, s.title, s.artist, s.bpm, s.song_type, s.jacket_url)), '[]'::jsonb)
        from songs s
       where exists (select 1 from charts c where c.song_id = s.id and c.version = p_version)
    ),
    'charts', (
      select coalesce(jsonb_agg(jsonb_build_array(
               c.id, c.song_id, c.mode, c.level, c.step_artist, c.note_count, c.skills,
               c.pass_difficulty, c.score_difficulty, c.scoring_level,
               b.score, b.grade, b.plate, b.achieved_at,
               o.score, o.grade, o.plate)), '[]'::jsonb)
        from charts c
        left join best_scores b on b.chart_id = c.id
        left join lateral (
          select ob.score, ob.grade, ob.plate
            from charts oc join best_scores ob on ob.chart_id = oc.id
           where oc.piuscores_id = c.piuscores_id and oc.version <> c.version
           order by ob.score desc limit 1
        ) o on c.piuscores_id is not null
       where c.version = p_version
    ),
    'profile', (
      select to_jsonb(p) from player_snapshots p
       where p.version = p_version order by p.taken_at desc limit 1
    ),
    'plays', (
      select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.score, x.grade, x.plate,
               x.perfect, x.great, x.good, x.bad, x.miss, x.played_at) order by x.played_at desc), '[]'::jsonb)
        from (select pl.* from plays pl join charts c on c.id = pl.chart_id
               where c.version = p_version order by pl.played_at desc limit 300) x
    ),
    'last_sync', (select max(started_at) from sync_runs where version = p_version),
    'pumbility_history', (
      select coalesce(jsonb_agg(jsonb_build_array(taken_at, pumbility) order by taken_at), '[]'::jsonb)
        from player_snapshots where version = p_version and pumbility is not null
    )
  )
$$;

grant execute on function public.app_data(text) to anon, authenticated;

-- Histórico de recordes de um chart
create or replace function public.chart_history(p_chart_id bigint)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'bests', (select coalesce(jsonb_agg(jsonb_build_array(seen_at, score, grade, plate) order by seen_at), '[]'::jsonb)
                from best_score_history where chart_id = p_chart_id),
    'plays', (select coalesce(jsonb_agg(jsonb_build_array(played_at, score, grade, plate, perfect, great, good, bad, miss) order by played_at desc), '[]'::jsonb)
                from plays where chart_id = p_chart_id)
  )
$$;
grant execute on function public.chart_history(bigint) to anon, authenticated;

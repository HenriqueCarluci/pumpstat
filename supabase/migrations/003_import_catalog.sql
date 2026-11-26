-- Importa o catálogo de charts (export CSV do PIU Scores) a partir do app.
-- p_rows: array de arrays na ordem das colunas do CSV:
-- ChartId, Song, Artist, StepArtist, Type, Level, SongType, BPM, NoteCount, Badges,
-- PassDifficulty, ScoreDifficulty, ScoringLevel
create or replace function public.import_catalog(p_key text, p_version text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        jsonb;
  v_song   bigint;
  v_mode   text;
  v_count  int := 0;
begin
  if p_key is null or p_key <> (select value from app_secrets where name = 'ingest_key') then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  if p_version not in ('phoenix', 'phoenix2') then
    raise exception 'versão inválida: %', p_version;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_mode := case r->>4 when 'S' then 'S' when 'D' then 'D' when 'CoOp' then 'C' else null end;
    continue when v_mode is null or nullif(r->>5, '') is null;

    insert into songs (title, artist, bpm, song_type)
    values (r->>1, nullif(r->>2, ''), nullif(r->>7, ''), nullif(r->>6, ''))
    on conflict (title) do update
       set artist    = coalesce(excluded.artist, songs.artist),
           bpm       = coalesce(excluded.bpm, songs.bpm),
           song_type = coalesce(excluded.song_type, songs.song_type)
    returning id into v_song;

    insert into charts (version, piuscores_id, song_id, mode, level, step_artist, note_count, skills,
                        pass_difficulty, score_difficulty, scoring_level, from_catalog)
    values (p_version, r->>0, v_song, v_mode, (r->>5)::int, nullif(r->>3, ''),
            nullif(r->>8, '')::int,
            case when coalesce(r->>9, '') = '' then null else string_to_array(r->>9, '; ') end,
            nullif(r->>10, ''), nullif(r->>11, ''), nullif(r->>12, '')::numeric, true)
    on conflict (version, song_id, mode, level) do update
       set piuscores_id     = excluded.piuscores_id,
           step_artist      = excluded.step_artist,
           note_count       = excluded.note_count,
           skills           = excluded.skills,
           pass_difficulty  = excluded.pass_difficulty,
           score_difficulty = excluded.score_difficulty,
           scoring_level    = excluded.scoring_level,
           from_catalog     = true;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'version', p_version, 'rows', v_count);
end;
$$;

revoke all on function public.import_catalog(text, text, jsonb) from public;
grant execute on function public.import_catalog(text, text, jsonb) to anon, authenticated;

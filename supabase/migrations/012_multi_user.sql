-- Vários usuários: cada conta do PumpStat tem os próprios recordes, jogadas e perfil.
-- Tabelas novas por usuário (as antigas, de dono único, ficam só para migrar os dados e depois saem).

create table public.piu_accounts (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  game_id      text,                 -- ex.: "CARLUCI #5527"
  piu_login    text,                 -- e-mail/ID do AM.PASS (sem senha)
  sync_key     text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_at   timestamptz not null default now(),
  last_sync_at timestamptz
);

create table public.user_scores (
  user_id      uuid not null references auth.users (id) on delete cascade,
  chart_id     bigint not null references public.charts (id) on delete cascade,
  score        int not null,
  grade        text,
  plate        text,
  broken       boolean not null default false,
  achieved_at  timestamptz,
  first_seen   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, chart_id)
);

create table public.user_score_history (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  chart_id  bigint not null references public.charts (id) on delete cascade,
  score     int not null,
  grade     text,
  plate     text,
  broken    boolean not null default false,
  seen_at   timestamptz not null default now()
);
create index user_score_history_idx on public.user_score_history (user_id, chart_id, seen_at);

create table public.user_plays (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  chart_id   bigint not null references public.charts (id) on delete cascade,
  score      int,
  grade      text,
  plate      text,
  broken     boolean not null default false,
  perfect    int, great int, good int, bad int, miss int,
  played_at  timestamptz not null,
  unique (user_id, chart_id, played_at)
);
create index user_plays_idx on public.user_plays (user_id, played_at desc);

create table public.user_profiles (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  version     text not null,
  nickname    text,
  title       text,
  avatar_url  text,
  pumbility   numeric,
  best_count  int,
  taken_at    timestamptz not null default now()
);
create index user_profiles_idx on public.user_profiles (user_id, version, taken_at desc);

create table public.user_syncs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  version     text not null,
  source      text not null default 'bookmarklet',  -- bookmarklet | server | app
  started_at  timestamptz not null default now(),
  best_count  int, play_count int, new_bests int, new_plays int,
  unmatched   jsonb
);
create index user_syncs_idx on public.user_syncs (user_id, version, started_at desc);

alter table public.piu_accounts       enable row level security;
alter table public.user_scores        enable row level security;
alter table public.user_score_history enable row level security;
alter table public.user_plays         enable row level security;
alter table public.user_profiles      enable row level security;
alter table public.user_syncs         enable row level security;

create policy "dono" on public.piu_accounts       for select to authenticated using (user_id = auth.uid());
create policy "dono" on public.user_scores        for select to authenticated using (user_id = auth.uid());
create policy "dono" on public.user_score_history for select to authenticated using (user_id = auth.uid());
create policy "dono" on public.user_plays         for select to authenticated using (user_id = auth.uid());
create policy "dono" on public.user_profiles      for select to authenticated using (user_id = auth.uid());
create policy "dono" on public.user_syncs         for select to authenticated using (user_id = auth.uid());

-- ---------- gravação ----------
-- Núcleo: grava o payload do coletor para um usuário.
create or replace function public.ingest_for(p_user uuid, p_payload jsonb, p_source text)
returns jsonb
language plpgsql security definer set search_path = public
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
  v_broken    boolean;
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
      end if;
    end loop;
  end loop;

  if p_payload ? 'profile' then
    insert into user_profiles (user_id, version, nickname, title, avatar_url, pumbility, best_count)
    values (p_user, v_version, p_payload->'profile'->>'nickname', p_payload->'profile'->>'title',
            p_payload->'profile'->>'avatar_url', nullif(p_payload->'profile'->>'pumbility', '')::numeric,
            jsonb_array_length(coalesce(p_payload->'bests', '[]'::jsonb)));
    insert into piu_accounts (user_id, game_id) values (p_user, p_payload->'profile'->>'nickname')
    on conflict (user_id) do update set game_id = coalesce(excluded.game_id, piu_accounts.game_id), last_sync_at = now();
  end if;

  insert into user_syncs (user_id, version, source, best_count, play_count, new_bests, new_plays, unmatched)
  values (p_user, v_version, p_source, jsonb_array_length(coalesce(p_payload->'bests', '[]'::jsonb)),
          jsonb_array_length(coalesce(p_payload->'plays', '[]'::jsonb)), v_new_bests, v_new_plays, v_unmatched);

  return jsonb_build_object('ok', true, 'version', v_version, 'new_bests', v_new_bests,
                            'new_plays', v_new_plays, 'unmatched', v_unmatched);
end;
$$;
revoke all on function public.ingest_for(uuid, jsonb, text) from public, anon, authenticated;

-- Usuário logado (app / servidor com o token do usuário)
create or replace function public.ingest_me(p_payload jsonb, p_source text default 'app')
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  return ingest_for(auth.uid(), p_payload, p_source);
end;
$$;
revoke all on function public.ingest_me(jsonb, text) from public, anon;
grant execute on function public.ingest_me(jsonb, text) to authenticated;

-- Favorito (bookmarklet): identifica o usuário pela chave pessoal de sincronização
create or replace function public.ingest(p_key text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  select user_id into v_user from piu_accounts where sync_key = p_key;
  if v_user is null then raise exception 'chave de sincronização inválida' using errcode = '28000'; end if;
  return ingest_for(v_user, p_payload, 'bookmarklet');
end;
$$;

-- Chave pessoal do usuário logado (cria a conta PIU vazia na primeira vez)
create or replace function public.my_sync_key()
returns text
language plpgsql security definer set search_path = public
as $$
declare v_key text;
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into piu_accounts (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select sync_key into v_key from piu_accounts where user_id = auth.uid();
  return v_key;
end;
$$;
revoke all on function public.my_sync_key() from public, anon;
grant execute on function public.my_sync_key() to authenticated;

-- Chaves de catálogo/capas continuam com a chave administrativa (app_secrets.ingest_key); qualquer usuário logado
-- pode disparar a atualização de catálogo pelo favorito no PIU Scores usando a própria chave pessoal.
create or replace function public.is_valid_key(p_key text)
returns boolean language sql stable security definer set search_path = public
as $$ select p_key = (select value from app_secrets where name = 'ingest_key')
          or exists (select 1 from piu_accounts where sync_key = p_key) $$;
revoke all on function public.is_valid_key(text) from public, anon, authenticated;

-- ---------- leitura ----------
create or replace function public.app_data(p_version text)
returns jsonb
language sql stable security invoker set search_path = public
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
               o.score, o.grade, o.plate, b.broken)), '[]'::jsonb)
        from charts c
        left join user_scores b on b.chart_id = c.id and b.user_id = auth.uid()
        left join lateral (
          select ob.score, ob.grade, ob.plate
            from charts oc join user_scores ob on ob.chart_id = oc.id and ob.user_id = auth.uid()
           where oc.piuscores_id = c.piuscores_id and oc.version <> c.version
           order by ob.score desc limit 1
        ) o on c.piuscores_id is not null
       where c.version = p_version
    ),
    'profile', (
      select to_jsonb(p) from user_profiles p
       where p.user_id = auth.uid() and p.version = p_version order by p.taken_at desc limit 1
    ),
    'plays', (
      select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.score, x.grade, x.plate,
               x.perfect, x.great, x.good, x.bad, x.miss, x.played_at, x.broken) order by x.played_at desc), '[]'::jsonb)
        from (select pl.* from user_plays pl join charts c on c.id = pl.chart_id
               where pl.user_id = auth.uid() and c.version = p_version order by pl.played_at desc limit 300) x
    ),
    'last_sync', (select max(started_at) from user_syncs where user_id = auth.uid() and version = p_version),
    'pumbility_history', (
      select coalesce(jsonb_agg(jsonb_build_array(taken_at, pumbility) order by taken_at), '[]'::jsonb)
        from user_profiles where user_id = auth.uid() and version = p_version and pumbility is not null
    )
  )
$$;

create or replace function public.chart_history(p_chart_id bigint)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'bests', (select coalesce(jsonb_agg(jsonb_build_array(seen_at, score, grade, plate, broken) order by seen_at), '[]'::jsonb)
                from user_score_history where chart_id = p_chart_id and user_id = auth.uid()),
    'plays', (select coalesce(jsonb_agg(jsonb_build_array(played_at, score, grade, plate, perfect, great, good, bad, miss, broken) order by played_at desc), '[]'::jsonb)
                from user_plays where chart_id = p_chart_id and user_id = auth.uid())
  )
$$;

-- Catálogo e capas aceitam a chave pessoal de qualquer usuário (dados públicos e idempotentes)
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
  if p_key is null or not is_valid_key(p_key) then
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

create or replace function public.jackets_apply(p_key text, p_items jsonb, p_only_missing boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         jsonb;
  v_id      bigint;
  v_updated int := 0;
  v_missing jsonb := '[]'::jsonb;
  v_rows    int;
begin
  if p_key is null or not is_valid_key(p_key) then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  for r in select * from jsonb_array_elements(p_items) loop
    v_id := find_song(r->>0);
    if v_id is null then
      v_missing := v_missing || to_jsonb(r->>0);
      continue;
    end if;
    update songs set jacket_url = r->>1
     where id = v_id and jacket_url is distinct from r->>1
       and (not p_only_missing or jacket_url is null);
    get diagnostics v_rows = row_count;
    v_updated := v_updated + v_rows;
  end loop;
  return jsonb_build_object('ok', true, 'updated', v_updated, 'not_found', v_missing,
    'without_jacket', (select count(*) from songs where jacket_url is null));
end;
$$;

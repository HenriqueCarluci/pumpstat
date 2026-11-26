-- PumpStat — schema inicial (Phoenix e Phoenix 2)
-- Leitura pública (anon) nas tabelas de dados; escrita somente pela função ingest(), protegida por chave.

create extension if not exists pgcrypto;

create or replace function public.title_key(t text) returns text
language sql immutable set search_path = public as $$
  select lower(regexp_replace(coalesce(t, ''), '[^[:alnum:]]', '', 'g'))
$$;

create table public.songs (
  id          bigint generated always as identity primary key,
  title       text not null unique,
  title_key   text generated always as (public.title_key(title)) stored,
  artist      text,
  bpm         text,
  song_type   text,                 -- Arcade | ShortCut | FullSong | Remix
  jacket_url  text,
  created_at  timestamptz not null default now()
);
create index songs_title_key_idx on public.songs (title_key);

create table public.charts (
  id               bigint generated always as identity primary key,
  version          text not null check (version in ('phoenix', 'phoenix2')),
  piuscores_id     text,             -- mesmo id para o mesmo stepchart entre versões
  song_id          bigint not null references public.songs (id) on delete cascade,
  mode             text not null check (mode in ('S', 'D', 'C')),  -- C = CO-OP
  level            int  not null,
  step_artist      text,
  note_count       int,
  skills           text[],
  pass_difficulty  text,
  score_difficulty text,
  scoring_level    numeric,
  from_catalog     boolean not null default true,
  unique (version, song_id, mode, level)
);
create index charts_version_idx on public.charts (version, mode, level);
create index charts_piuscores_idx on public.charts (piuscores_id);
create index charts_song_idx on public.charts (song_id);

create table public.best_scores (
  chart_id     bigint primary key references public.charts (id) on delete cascade,
  score        int not null,
  grade        text,
  plate        text,
  achieved_at  timestamptz,
  first_seen   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.best_score_history (
  id        bigint generated always as identity primary key,
  chart_id  bigint not null references public.charts (id) on delete cascade,
  score     int not null,
  grade     text,
  plate     text,
  seen_at   timestamptz not null default now()
);
create index best_score_history_chart_idx on public.best_score_history (chart_id, seen_at);

create table public.plays (
  id         bigint generated always as identity primary key,
  chart_id   bigint not null references public.charts (id) on delete cascade,
  score      int,
  grade      text,
  plate      text,
  perfect    int, great int, good int, bad int, miss int,
  played_at  timestamptz not null,
  unique (chart_id, played_at)
);
create index plays_played_at_idx on public.plays (played_at desc);

create table public.player_snapshots (
  id          bigint generated always as identity primary key,
  version     text not null,
  nickname    text,
  title       text,
  avatar_url  text,
  pumbility   numeric,
  best_count  int,
  taken_at    timestamptz not null default now()
);

create table public.sync_runs (
  id          bigint generated always as identity primary key,
  version     text not null,
  started_at  timestamptz not null default now(),
  best_count  int,
  play_count  int,
  new_bests   int,
  new_plays   int,
  unmatched   jsonb
);

-- Segredos (sem policy: anon não lê)
create table public.app_secrets (
  name   text primary key,
  value  text not null
);
insert into public.app_secrets (name, value)
values ('ingest_key', encode(extensions.gen_random_bytes(18), 'hex'))
on conflict do nothing;

-- RLS
alter table public.songs              enable row level security;
alter table public.charts             enable row level security;
alter table public.best_scores        enable row level security;
alter table public.best_score_history enable row level security;
alter table public.plays              enable row level security;
alter table public.player_snapshots   enable row level security;
alter table public.sync_runs          enable row level security;
alter table public.app_secrets        enable row level security;

create policy "leitura publica" on public.songs              for select to anon, authenticated using (true);
create policy "leitura publica" on public.charts             for select to anon, authenticated using (true);
create policy "leitura publica" on public.best_scores        for select to anon, authenticated using (true);
create policy "leitura publica" on public.best_score_history for select to anon, authenticated using (true);
create policy "leitura publica" on public.plays              for select to anon, authenticated using (true);
create policy "leitura publica" on public.player_snapshots   for select to anon, authenticated using (true);
create policy "leitura publica" on public.sync_runs          for select to anon, authenticated using (true);

-- Treino em casa: recordes importados de simuladores (StepP1, XSanity) pelo arquivo Stats.xml do perfil.
-- Ficam separados dos recordes do fliperama: não entram em PUMBILITY do servidor, missões, rankings nem estatísticas de outros.
-- Desligado no geral (toggle 'home_import' = false) até o admin ligar; depois cada usuário ativa em Ajustes e escolhe
-- ver separado ou consolidado com a Phoenix 2 (consolidação feita no app, só para a própria pessoa).

create table if not exists public.home_scores (
  user_id     uuid not null references auth.users (id) on delete cascade,
  chart_id    bigint not null references public.charts (id) on delete cascade,
  source      text not null check (source in ('stepp1', 'xsanity', 'stepf2', 'other')),
  score       int,
  grade       text,
  broken      boolean not null default false,
  plays       int,
  last_played timestamptz,
  perfect int, great int, good int, bad int, miss int,
  updated_at  timestamptz not null default now(),
  primary key (user_id, chart_id, source)
);
alter table public.home_scores enable row level security;
revoke all on public.home_scores from anon, authenticated;

alter table public.user_settings add column if not exists home_scores_on boolean not null default false;
alter table public.user_settings add column if not exists home_scores_mode text not null default 'separate'
  check (home_scores_mode in ('separate', 'merged'));

-- desligado no geral até o admin ligar
update app_settings set value = jsonb_set(coalesce(value, '{}'::jsonb), '{toggles}',
  coalesce(value->'toggles', '{}'::jsonb) || jsonb_build_object('home_import', false))
 where key = 'plans' and not (coalesce(value->'toggles', '{}'::jsonb) ? 'home_import');

create or replace function public.home_import_on() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.app_config()->'toggles'->>'home_import')::boolean, false)
$$;

create or replace function public.my_home_settings() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('available', public.home_import_on(),
    'on', public.home_import_on() and coalesce((select home_scores_on from user_settings where user_id = auth.uid()), false),
    'mode', coalesce((select home_scores_mode from user_settings where user_id = auth.uid()), 'separate'),
    'count', (select count(*) from home_scores where user_id = auth.uid()))
  where auth.uid() is not null
$$;

create or replace function public.set_home_settings(p_on boolean, p_mode text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not public.home_import_on() then raise exception 'recurso desligado'; end if;
  insert into user_settings (user_id, home_scores_on, home_scores_mode)
  values (auth.uid(), coalesce(p_on, false), coalesce(p_mode, 'separate'))
  on conflict (user_id) do update set home_scores_on = coalesce(p_on, user_settings.home_scores_on),
    home_scores_mode = coalesce(p_mode, user_settings.home_scores_mode);
  return public.my_home_settings();
end $$;

-- grava os recordes (fica o melhor por chart e simulador)
-- p_rows: [{chart, score, grade, broken, plays, last_played, perfect, great, good, bad, miss}]
create or replace function public.save_home_scores(p_source text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb; n int := 0;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not public.home_import_on() or not coalesce((select home_scores_on from user_settings where user_id = me), false) then
    raise exception 'ative o treino em casa em Ajustes';
  end if;
  if p_source not in ('stepp1', 'xsanity', 'stepf2', 'other') then raise exception 'simulador inválido'; end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 5000 then raise exception 'arquivo grande demais'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    continue when not exists (select 1 from charts where id = (r->>'chart')::bigint);
    insert into home_scores (user_id, chart_id, source, score, grade, broken, plays, last_played, perfect, great, good, bad, miss, updated_at)
    values (me, (r->>'chart')::bigint, p_source, least(greatest((r->>'score')::int, 0), 1000000), left(r->>'grade', 8),
            coalesce((r->>'broken')::boolean, false), (r->>'plays')::int, (r->>'last_played')::timestamptz,
            (r->>'perfect')::int, (r->>'great')::int, (r->>'good')::int, (r->>'bad')::int, (r->>'miss')::int, now())
    on conflict (user_id, chart_id, source) do update set
      score = case when excluded.broken and not home_scores.broken then home_scores.score
                   when home_scores.broken and not excluded.broken then excluded.score
                   else greatest(home_scores.score, excluded.score) end,
      grade = case when (excluded.score > home_scores.score and not (excluded.broken and not home_scores.broken))
                     or (home_scores.broken and not excluded.broken) then excluded.grade else home_scores.grade end,
      broken = home_scores.broken and excluded.broken,
      plays = greatest(coalesce(home_scores.plays, 0), coalesce(excluded.plays, 0)),
      last_played = greatest(home_scores.last_played, excluded.last_played),
      perfect = case when excluded.score >= coalesce(home_scores.score, 0) then excluded.perfect else home_scores.perfect end,
      great = case when excluded.score >= coalesce(home_scores.score, 0) then excluded.great else home_scores.great end,
      good = case when excluded.score >= coalesce(home_scores.score, 0) then excluded.good else home_scores.good end,
      bad = case when excluded.score >= coalesce(home_scores.score, 0) then excluded.bad else home_scores.bad end,
      miss = case when excluded.score >= coalesce(home_scores.score, 0) then excluded.miss else home_scores.miss end,
      updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('saved', n);
end $$;

-- [chart, simulador, score, grade, quebrou, jogadas, última vez, perfect, great, good, bad, miss]
create or replace function public.my_home_scores(p_version text default 'phoenix2') returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(h.chart_id, h.source, h.score, h.grade, h.broken, h.plays, h.last_played,
                                              h.perfect, h.great, h.good, h.bad, h.miss) order by h.chart_id), '[]'::jsonb)
    from home_scores h join charts c on c.id = h.chart_id and c.version = p_version
   where h.user_id = auth.uid() and public.home_import_on()
$$;

create or replace function public.clear_home_scores(p_source text default null) returns void
language sql security definer set search_path = public as $$
  delete from home_scores where user_id = auth.uid() and (p_source is null or source = p_source)
$$;

revoke all on function public.home_import_on(), public.my_home_settings(), public.set_home_settings(boolean, text),
  public.save_home_scores(text, jsonb), public.my_home_scores(text), public.clear_home_scores(text) from public, anon;
grant execute on function public.home_import_on(), public.my_home_settings(), public.set_home_settings(boolean, text),
  public.save_home_scores(text, jsonb), public.my_home_scores(text), public.clear_home_scores(text) to authenticated;

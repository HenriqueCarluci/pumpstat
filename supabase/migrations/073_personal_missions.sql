-- 073: missões da semana personalizadas.
-- As missões são geradas no aparelho (a partir do histórico do jogador) na primeira abertura da semana e ficam
-- congeladas aqui: a meta e os charts citados não mudam no meio da semana. O aparelho manda o progresso; o servidor
-- guarda, marca a semana completa (só se houve jogada nela) e dá os selos. Configuração em app_config()->'missions'.

create table if not exists public.user_week_missions (
  user_id       uuid not null references auth.users (id) on delete cascade,
  week          date not null,                 -- segunda-feira da semana
  mode          text,
  focus         text not null default 'auto' check (focus in ('auto', 'level', 'score', 'weak', 'fun')),
  focus_changes int not null default 0,
  rerolls       int not null default 0,
  missions      jsonb not null,                -- definições congeladas
  progress      jsonb,                         -- [atual, ...] na ordem das missões
  done          int not null default 0,
  total         int not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, week)
);
create index if not exists user_week_missions_week_idx on public.user_week_missions (week);
alter table public.user_week_missions enable row level security;
revoke all on public.user_week_missions from anon, authenticated;

create table if not exists public.user_badges (
  user_id   uuid not null references auth.users (id) on delete cascade,
  badge     text not null check (badge in ('weeks', 'streak')),
  level     int not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge, level)
);
alter table public.user_badges enable row level security;
revoke all on public.user_badges from anon, authenticated;

-- dias em que a pessoa entrou numa fila de fliperama (para a missão de check-in)
create table if not exists public.user_venue_visits (
  user_id  uuid not null references auth.users (id) on delete cascade,
  venue_id bigint not null references public.venues (id) on delete cascade,
  day      date not null,
  primary key (user_id, venue_id, day)
);
alter table public.user_venue_visits enable row level security;
revoke all on public.user_venue_visits from anon, authenticated;

create or replace function public.log_venue_visit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    insert into user_venue_visits (user_id, venue_id, day)
    select new.user_id, m.venue_id, (now() at time zone 'America/Sao_Paulo')::date from machines m where m.id = new.machine_id
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.log_venue_visit() from public, anon, authenticated;
drop trigger if exists queue_entries_visit on public.queue_entries;
create trigger queue_entries_visit after insert on public.queue_entries for each row execute function public.log_venue_visit();

-- selos de um jogador: [[selo, nível, quando], ...]
create or replace function public.badges_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(badge, level, extract(epoch from earned_at)::bigint) order by badge, level), '[]'::jsonb)
    from user_badges where user_id = p_user
$$;
revoke all on function public.badges_of(uuid) from public, anon;
grant execute on function public.badges_of(uuid) to authenticated;

-- semana válida: segunda-feira perto da semana atual (o aparelho pode estar num fuso diferente)
create or replace function public.mission_week_ok(p_week date)
returns boolean language sql stable as $$
  select p_week is not null and extract(isodow from p_week) = 1
     and abs(p_week - date_trunc('week', now() at time zone 'America/Sao_Paulo')::date) <= 7
$$;

-- tudo o que o aparelho precisa para montar e acompanhar as missões da semana
create or replace function public.missions_ctx(p_week date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_from timestamptz;
  v_to timestamptz;
  v_rival uuid;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not mission_week_ok(p_week) then raise exception 'semana inválida'; end if;
  v_from := p_week::timestamp at time zone 'America/Sao_Paulo';
  v_to := v_from + interval '7 days';
  select s.rival into v_rival from user_settings s where s.user_id = me and s.rival is not null and are_friends(me, s.rival);
  return jsonb_build_object(
    'row', (select to_jsonb(w) - 'user_id' from user_week_missions w where w.user_id = me and w.week = p_week),
    'past', (select coalesce(jsonb_agg(jsonb_build_object(
                'week', w.week, 'done', w.done, 'total', w.total, 'completed_at', w.completed_at, 'created_at', w.created_at,
                'types', (select coalesce(jsonb_agg(m->>'type'), '[]'::jsonb) from jsonb_array_elements(w.missions) m)) order by w.week desc), '[]'::jsonb)
               from (select * from user_week_missions where user_id = me and week < p_week order by week desc limit 8) w),
    'rival', case when v_rival is null then null else jsonb_build_object(
               'id', v_rival, 'nickname', presence_card(me, v_rival)->>'nickname',
               'cleared', (select coalesce(jsonb_agg(s.chart_id), '[]'::jsonb) from user_scores s join charts c on c.id = s.chart_id
                            where s.user_id = v_rival and not s.broken and c.mode in ('S', 'D'))) end,
    'friends', (select coalesce(jsonb_agg(jsonb_build_array(f.chart_id, f.nick)), '[]'::jsonb) from (
                  select distinct on (p.chart_id) p.chart_id, presence_card(me, p.user_id)->>'nickname' as nick
                    from user_plays p
                   where p.played_at >= v_from and p.played_at < v_to
                     and p.user_id in (select case when f.requester = me then f.addressee else f.requester end from friendships f
                                        where f.status = 'accepted' and (f.requester = me or f.addressee = me))
                   order by p.chart_id, p.played_at desc limit 400) f),
    'checkins', (select count(distinct day) from user_venue_visits where user_id = me and day >= p_week and day < p_week + 7),
    'visited', exists (select 1 from user_venue_visits where user_id = me and day >= p_week - 60),
    'friend_count', (select count(*) from friendships f where f.status = 'accepted' and (f.requester = me or f.addressee = me)),
    'badges', badges_of(me));
end $$;
revoke all on function public.missions_ctx(date) from public, anon;
grant execute on function public.missions_ctx(date) to authenticated;

-- grava as missões da semana: init (só se ainda não existem), reroll (troca uma missão) ou focus (troca o foco)
create or replace function public.set_week_missions(p_week date, p_mode text, p_focus text, p_missions jsonb, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := coalesce(app_config()->'missions', '{}'::jsonb);
  r user_week_missions;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not mission_week_ok(p_week) then raise exception 'semana inválida'; end if;
  if p_focus not in ('auto', 'level', 'score', 'weak', 'fun') then raise exception 'foco inválido'; end if;
  if jsonb_typeof(p_missions) <> 'array' or jsonb_array_length(p_missions) not between 1 and 8 or octet_length(p_missions::text) > 30000 then
    raise exception 'missões inválidas';
  end if;
  select * into r from user_week_missions where user_id = me and week = p_week for update;
  if p_action = 'init' then
    if found then return to_jsonb(r) - 'user_id'; end if;
    insert into user_week_missions (user_id, week, mode, focus, missions, total)
    values (me, p_week, p_mode, p_focus, p_missions, jsonb_array_length(p_missions)) returning * into r;
  elsif p_action = 'reroll' then
    if not found then raise exception 'missões da semana não encontradas'; end if;
    if r.rerolls >= coalesce((cfg->>'rerolls')::int, 1) then raise exception 'você já trocou todas as missões que podia esta semana'; end if;
    update user_week_missions set missions = p_missions, total = jsonb_array_length(p_missions), rerolls = rerolls + 1, updated_at = now()
     where user_id = me and week = p_week returning * into r;
  elsif p_action = 'focus' then
    if coalesce((cfg->>'focus')::boolean, true) = false then raise exception 'a escolha de foco está desligada'; end if;
    if not found then
      insert into user_week_missions (user_id, week, mode, focus, missions, total, focus_changes)
      values (me, p_week, p_mode, p_focus, p_missions, jsonb_array_length(p_missions), 1) returning * into r;
    else
      if r.focus_changes >= coalesce((cfg->>'focus_changes')::int, 1) then raise exception 'você já trocou o foco esta semana'; end if;
      update user_week_missions set focus = p_focus, mode = p_mode, missions = p_missions, total = jsonb_array_length(p_missions),
             focus_changes = focus_changes + 1, completed_at = null, updated_at = now()
       where user_id = me and week = p_week returning * into r;
    end if;
  else
    raise exception 'ação inválida';
  end if;
  return to_jsonb(r) - 'user_id';
end $$;
revoke all on function public.set_week_missions(date, text, text, jsonb, text) from public, anon;
grant execute on function public.set_week_missions(date, text, text, jsonb, text) to authenticated;

-- progresso enviado pelo aparelho; fecha a semana e dá os selos
create or replace function public.report_week_progress(p_week date, p_progress jsonb, p_done int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := coalesce(app_config()->'missions', '{}'::jsonb);
  r user_week_missions;
  v_from timestamptz;
  v_new jsonb := '[]'::jsonb;
  v_n int;
  v_streak int := 0;
  v_w date;
  v_mark int;
  v_names jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not mission_week_ok(p_week) then raise exception 'semana inválida'; end if;
  if jsonb_typeof(p_progress) <> 'array' or jsonb_array_length(p_progress) > 8 then raise exception 'progresso inválido'; end if;
  update user_week_missions set progress = p_progress, done = greatest(0, least(coalesce(p_done, 0), total)), updated_at = now()
   where user_id = me and week = p_week returning * into r;
  if not found then return null; end if;
  v_from := p_week::timestamp at time zone 'America/Sao_Paulo';

  if r.total > 0 and r.done >= r.total and r.completed_at is null
     and exists (select 1 from user_plays p where p.user_id = me and p.played_at >= v_from - interval '1 day' and p.played_at < v_from + interval '8 days') then
    update user_week_missions set completed_at = now() where user_id = me and week = p_week returning * into r;
    select count(*) into v_n from user_week_missions where user_id = me and completed_at is not null;
    v_names := coalesce(cfg->'week_names', '{}'::jsonb);
    for v_mark in select x::int from jsonb_array_elements_text(coalesce(cfg->'week_marks', '[1,5,10,25,50]'::jsonb)) x loop
      if v_n >= v_mark then
        insert into user_badges (user_id, badge, level) values (me, 'weeks', v_mark) on conflict do nothing;
        if found then
          v_new := v_new || jsonb_build_array(jsonb_build_array('weeks', v_mark));
          perform notify(me, 'badge', null, 'weeks:' || v_mark, jsonb_build_object('badge', 'weeks', 'level', v_mark, 'name', v_names->>v_mark::text));
        end if;
      end if;
    end loop;
  end if;

  -- sequência de semanas com jogada (calculada aqui, não vem do aparelho)
  v_w := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
  if not exists (select 1 from user_plays p where p.user_id = me and p.played_at >= (v_w::timestamp at time zone 'America/Sao_Paulo')) then v_w := v_w - 7; end if;
  while v_streak < 104 and exists (select 1 from user_plays p where p.user_id = me
          and p.played_at >= (v_w::timestamp at time zone 'America/Sao_Paulo') and p.played_at < ((v_w + 7)::timestamp at time zone 'America/Sao_Paulo')) loop
    v_streak := v_streak + 1; v_w := v_w - 7;
  end loop;
  v_names := coalesce(cfg->'streak_names', '{}'::jsonb);
  for v_mark in select x::int from jsonb_array_elements_text(coalesce(cfg->'streak_marks', '[4,8,12,26,52]'::jsonb)) x loop
    if v_streak >= v_mark then
      insert into user_badges (user_id, badge, level) values (me, 'streak', v_mark) on conflict do nothing;
      if found then
        v_new := v_new || jsonb_build_array(jsonb_build_array('streak', v_mark));
        perform notify(me, 'badge', null, 'streak:' || v_mark, jsonb_build_object('badge', 'streak', 'level', v_mark, 'name', v_names->>v_mark::text));
      end if;
    end if;
  end loop;
  return jsonb_build_object('completed', r.completed_at is not null, 'new', v_new, 'streak', v_streak);
end $$;
revoke all on function public.report_week_progress(date, jsonb, int) from public, anon;
grant execute on function public.report_week_progress(date, jsonb, int) to authenticated;

-- painel do admin: as últimas 8 semanas e a taxa de conclusão de cada tipo de missão
create or replace function public.admin_mission_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_since date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date - 49;
begin
  perform admin_guard('events');
  return jsonb_build_object(
    'weeks', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('focus', (
                  select jsonb_object_agg(f.focus, f.n) from (select focus, count(*) as n from user_week_missions w2 where w2.week = x.week group by focus) f))
                order by x.week desc), '[]'::jsonb) from (
                select week, count(*) as users, count(completed_at) as completed,
                       round(avg(case when total > 0 then done::numeric / total end) * 100) as avg_pct,
                       sum(rerolls) as rerolls, sum(focus_changes) as focus_changes
                  from user_week_missions where week >= v_since group by week) x),
    'types', (select coalesce(jsonb_agg(y order by y.shown desc), '[]'::jsonb) from (
                select m.value->>'type' as type, m.value->>'tier' as tier, count(*) as shown,
                       count(*) filter (where coalesce((w.progress->>(m.ordinality - 1)::int)::numeric, 0) >= coalesce((m.value->>'goal')::numeric, 1)) as done
                  from user_week_missions w, jsonb_array_elements(w.missions) with ordinality m
                 where w.week >= v_since and w.week < date_trunc('week', now() at time zone 'America/Sao_Paulo')::date
                 group by 1, 2) y),
    'badges', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select badge || ':' || level as k, count(*) as n from user_badges group by 1) z));
end $$;
revoke all on function public.admin_mission_stats() from public, anon;
grant execute on function public.admin_mission_stats() to authenticated;

-- a configuração das missões (app_config.missions) fica com quem cuida dos desafios
create or replace function public.admin_set_config(p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  old jsonb := app_config();
  plan_keys constant text[] := array['show_plans','enforce','sales','trial_plan','trial_days','features','limits','prices'];
  k text;
begin
  perform admin_guard();
  if jsonb_typeof(p_value) <> 'object' then raise exception 'opção inválida'; end if;
  for k in select x from jsonb_object_keys(p_value) x union select x from jsonb_object_keys(old) x loop
    if (old -> k) is distinct from (p_value -> k) then
      perform admin_guard(case when k = any(plan_keys) then 'plans' when k = 'ads' then 'ads' when k = 'community' then 'charts'
                               when k = 'missions' then 'events' else 'config' end);
    end if;
  end loop;
  insert into app_settings (key, value, updated_at, updated_by) values ('plans', p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;

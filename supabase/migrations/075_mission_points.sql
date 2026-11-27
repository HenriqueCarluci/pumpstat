-- 075: pontuação do app. Cada missão completa dá pontos pelo nível (fácil, médio, desafio, bônus) e a semana completa dá um bônus.
-- Valores e liga/desliga em app_config.missions (points, points_by). O total aparece no perfil.
alter table public.user_week_missions add column if not exists points int not null default 0;

create or replace function public.points_of(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when coalesce((app_config()->'missions'->>'points')::boolean, true)
              then (select coalesce(sum(points), 0)::int from user_week_missions where user_id = p_user) end
$$;
revoke all on function public.points_of(uuid) from public, anon;
grant execute on function public.points_of(uuid) to authenticated;

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
  v_badges boolean := coalesce((cfg->>'badges')::boolean, true);
  v_pts jsonb := coalesce(cfg->'points_by', '{}'::jsonb);
  v_points int := 0;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not mission_week_ok(p_week) then raise exception 'semana inválida'; end if;
  if jsonb_typeof(p_progress) <> 'array' or jsonb_array_length(p_progress) > 8 then raise exception 'progresso inválido'; end if;
  update user_week_missions set progress = p_progress, done = greatest(0, least(coalesce(p_done, 0), total)), updated_at = now()
   where user_id = me and week = p_week returning * into r;
  if not found then return null; end if;
  v_from := p_week::timestamp at time zone 'America/Sao_Paulo';

  -- pontos: cada missão completa vale pelo nível dela, mais o bônus da semana completa (o admin pode desligar)
  if coalesce((cfg->>'points')::boolean, true) then
    select coalesce(sum(case m.value->>'tier'
               when 'easy' then coalesce((v_pts->>'easy')::int, 10) when 'medium' then coalesce((v_pts->>'medium')::int, 20)
               when 'hard' then coalesce((v_pts->>'hard')::int, 40) when 'bonus' then coalesce((v_pts->>'bonus')::int, 30) else 0 end), 0)
      into v_points
      from jsonb_array_elements(r.missions) with ordinality m
     where coalesce((r.progress->>(m.ordinality - 1)::int)::numeric, 0) >= coalesce((m.value->>'goal')::numeric, 1);
    if r.total > 0 and r.done >= r.total then v_points := v_points + coalesce((v_pts->>'week')::int, 50); end if;
    update user_week_missions set points = least(greatest(v_points, 0), 5000) where user_id = me and week = p_week returning * into r;
  end if;

  if r.total > 0 and r.done >= r.total and r.completed_at is null
     and exists (select 1 from user_plays p where p.user_id = me and p.played_at >= v_from - interval '1 day' and p.played_at < v_from + interval '8 days') then
    update user_week_missions set completed_at = now() where user_id = me and week = p_week returning * into r;
    select count(*) into v_n from user_week_missions where user_id = me and completed_at is not null;
    v_names := coalesce(cfg->'week_names', '{}'::jsonb);
    for v_mark in select x::int from jsonb_array_elements_text(coalesce(cfg->'week_marks', '[1,5,10,25,50]'::jsonb)) x loop
      if v_badges and v_n >= v_mark then
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
    if v_badges and v_streak >= v_mark then
      insert into user_badges (user_id, badge, level) values (me, 'streak', v_mark) on conflict do nothing;
      if found then
        v_new := v_new || jsonb_build_array(jsonb_build_array('streak', v_mark));
        perform notify(me, 'badge', null, 'streak:' || v_mark, jsonb_build_object('badge', 'streak', 'level', v_mark, 'name', v_names->>v_mark::text));
      end if;
    end if;
  end loop;
  return jsonb_build_object('completed', r.completed_at is not null, 'new', v_new, 'streak', v_streak, 'points', r.points,
    'points_total', (select coalesce(sum(points), 0) from user_week_missions where user_id = me));
end $$;
revoke all on function public.report_week_progress(date, jsonb, int) from public, anon;
grant execute on function public.report_week_progress(date, jsonb, int) to authenticated;


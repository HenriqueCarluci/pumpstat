-- 074: o admin pode desligar os selos das missões (app_config.missions.badges = false).
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
  return jsonb_build_object('completed', r.completed_at is not null, 'new', v_new, 'streak', v_streak);
end $$;
revoke all on function public.report_week_progress(date, jsonb, int) from public, anon;
grant execute on function public.report_week_progress(date, jsonb, int) to authenticated;


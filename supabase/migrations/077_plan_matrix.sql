-- 077: matriz de planos nova. Limites e recursos por plano também nas missões (quantidade, trocas e foco).
-- plan_limit/plan_can valem só com a cobrança ligada (app_config.enforce); admin não tem limite.

create or replace function public.plan_limit(p_user uuid, p_key text)
returns int language sql stable security definer set search_path = public as $$
  select case when coalesce((app_config()->>'enforce')::boolean, false) and not coalesce(is_app_admin(p_user), false) then
    nullif(coalesce(app_config()->'limits'->plan_of(p_user)->>p_key,
      ('{"free":{"friends":5,"missions":2,"mission_rerolls":0},"plus":{"friends":10,"missions":4,"mission_rerolls":1},"pro":{"missions":5,"mission_rerolls":2}}'::jsonb)->plan_of(p_user)->>p_key), '')::int
  end
$$;
revoke all on function public.plan_limit(uuid, text) from public, anon, authenticated;

create or replace function public.plan_can(p_user uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((app_config()->>'enforce')::boolean, false) or coalesce(is_app_admin(p_user), false)
      or array_position(array['free','plus','pro'], plan_of(p_user))
         >= array_position(array['free','plus','pro'], coalesce(app_config()->'features'->>p_feature,
              ('{"missions_focus":"pro","training_list":"plus","day_report":"plus"}'::jsonb)->>p_feature, 'free'))
$$;
revoke all on function public.plan_can(uuid, text) from public, anon, authenticated;

create or replace function public.set_week_missions(p_week date, p_mode text, p_focus text, p_missions jsonb, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := coalesce(app_config()->'missions', '{}'::jsonb);
  r user_week_missions;
  v_max int := plan_limit(auth.uid(), 'missions');
  v_rerolls int := coalesce(plan_limit(auth.uid(), 'mission_rerolls'), (cfg->>'rerolls')::int, 1);
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not mission_week_ok(p_week) then raise exception 'semana inválida'; end if;
  if p_focus not in ('auto', 'level', 'score', 'weak', 'fun') then raise exception 'foco inválido'; end if;
  if jsonb_typeof(p_missions) <> 'array' or jsonb_array_length(p_missions) not between 1 and 8 or octet_length(p_missions::text) > 30000 then
    raise exception 'missões inválidas';
  end if;
  if v_max is not null and jsonb_array_length(p_missions) > v_max + 1 then raise exception 'missões inválidas'; end if;
  select * into r from user_week_missions where user_id = me and week = p_week for update;
  if p_action = 'init' then
    if found then return to_jsonb(r) - 'user_id'; end if;
    insert into user_week_missions (user_id, week, mode, focus, missions, total)
    values (me, p_week, p_mode, p_focus, p_missions, jsonb_array_length(p_missions)) returning * into r;
  elsif p_action = 'reroll' then
    if not found then raise exception 'missões da semana não encontradas'; end if;
    if r.rerolls >= v_rerolls then raise exception 'você já trocou todas as missões que podia esta semana'; end if;
    update user_week_missions set missions = p_missions, total = jsonb_array_length(p_missions), rerolls = rerolls + 1, updated_at = now()
     where user_id = me and week = p_week returning * into r;
  elsif p_action = 'focus' then
    if coalesce((cfg->>'focus')::boolean, true) = false or not plan_can(me, 'missions_focus') then raise exception 'a escolha de foco está desligada'; end if;
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


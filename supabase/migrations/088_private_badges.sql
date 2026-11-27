-- 088: perfil privado também esconde pontos e selos das missões para os outros.
create or replace function public.badges_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(badge, level, extract(epoch from earned_at)::bigint) order by badge, level), '[]'::jsonb)
    from user_badges where user_id = p_user and not stats_private(p_user)
$$;
create or replace function public.points_of(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when coalesce((app_config()->'missions'->>'points')::boolean, true) and not stats_private(p_user)
              then (select coalesce(sum(points), 0)::int from user_week_missions where user_id = p_user) end
$$;

-- 086: registro do "ver como usuário" visível para o dono (Admin → Equipe).
create or replace function public.admin_view_as_history(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('view_as');
  return coalesce((select jsonb_agg(x order by x.started_at desc) from (
    select l.id, l.started_at, l.ended_at,
           (select u.email from auth.users u where u.id = l.admin_id) as admin_email,
           (select p.nickname from user_profiles p where p.user_id = l.admin_id order by p.taken_at desc limit 1) as admin_nick,
           (select u.email from auth.users u where u.id = l.target_id) as target_email,
           (select p.nickname from user_profiles p where p.user_id = l.target_id order by p.taken_at desc limit 1) as target_nick,
           (select v.expires_at from admin_view_as v where v.admin_id = l.admin_id and v.target_id = l.target_id and l.ended_at is null) as expires_at
      from admin_view_as_log l
     order by l.started_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x), '[]'::jsonb);
end $$;
revoke all on function public.admin_view_as_history(int) from public, anon;
grant execute on function public.admin_view_as_history(int) to authenticated;

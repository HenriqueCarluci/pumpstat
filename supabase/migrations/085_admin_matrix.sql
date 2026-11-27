-- 085: Matriz de perfis da equipe revisada.
-- Números do app (stats) e Monitoramento (health) só para dono e admin geral; "ver como usuário" (view_as) só o dono.

create or replace function public.admin_perms(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'owner'     then array['plans','roles','view_as','stats','health','users','ban','reports','feedback','charts','events','venues','ads','config']
    when 'admin'     then array['stats','health','users','ban','reports','feedback','charts','events','venues','ads','config']
    when 'moderator' then array['users','ban','reports']
    when 'curator'   then array['charts']
    when 'events'    then array['events','venues']
    when 'support'   then array['users','feedback']
    else array[]::text[] end
$$;

do $$
begin
  execute replace(pg_get_functiondef('public.admin_health()'::regprocedure), 'admin_guard(''stats'')', 'admin_guard(''health'')');
  execute replace(pg_get_functiondef('public.admin_clear_client_errors()'::regprocedure), 'admin_guard(''config'')', 'admin_guard(''health'')');
  execute replace(pg_get_functiondef('public.admin_start_view_as(uuid, integer)'::regprocedure),
    'if coalesce(admin_role(me), '''') not in (''owner'', ''admin'') then', 'if not has_admin_perm(''view_as'', me) then');
end $$;

-- 067: perfis de administração. Cada pessoa da equipe tem um papel; cada função admin_* exige uma permissão.
--   owner     Dono: tudo, inclusive planos/cobrança e quem é da equipe
--   admin     Administrador geral: tudo, menos planos/cobrança e gestão da equipe
--   moderator Moderação: denúncias, bloquear/desbloquear contas, ver usuários
--   curator   Curadoria de charts: tier do clube, votações de tier, gimmicks, R!SE, vídeos, regras da votação
--   events    Eventos e comunidade: desafios e prêmios, locais (fliperamas) e times
--   support   Suporte: mensagens do suporte e consulta de usuários
alter table public.app_admins add column if not exists role text not null default 'owner'
  check (role in ('owner', 'admin', 'moderator', 'curator', 'events', 'support'));

create or replace function public.admin_role(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from app_admins where user_id = p_user
$$;

create or replace function public.admin_perms(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'owner'     then array['plans','roles','stats','users','ban','reports','feedback','charts','events','venues','ads','config']
    when 'admin'     then array['stats','users','ban','reports','feedback','charts','events','venues','ads','config']
    when 'moderator' then array['stats','users','ban','reports']
    when 'curator'   then array['stats','charts']
    when 'events'    then array['stats','events','venues']
    when 'support'   then array['stats','users','feedback']
    else array[]::text[] end
$$;

create or replace function public.has_admin_perm(p_perm text, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_perm = any(admin_perms(admin_role(p_user))), false)
$$;

create or replace function public.admin_guard(p_perm text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not has_admin_perm(p_perm) then raise exception 'sem permissão para isso' using errcode = '42501'; end if;
end $$;
revoke all on function public.admin_guard(text) from public, anon, authenticated;
revoke all on function public.has_admin_perm(text, uuid) from public, anon;

-- cada função admin_* passa a exigir a permissão da sua área
do $$
declare r record; d text;
begin
  for r in select * from (values
    ('admin_ad_stats','ads'),
    ('admin_challenges','events'), ('admin_save_challenge','events'), ('admin_draw_challenge','events'), ('admin_mark_prize','events'),
    ('admin_close_tier','charts'), ('admin_set_chart_flags','charts'), ('admin_set_chart_tier','charts'),
    ('admin_set_song_rise','charts'), ('admin_set_video','charts'),
    ('admin_feedback','feedback'), ('admin_feedback_status','feedback'),
    ('admin_inactive_venues','venues'), ('admin_review_venue','venues'), ('admin_review_venue_removal','venues'),
    ('admin_set_venue_active','venues'), ('admin_venue_requests','venues'),
    ('admin_teams','venues'), ('admin_review_team','venues'), ('admin_set_team_media','venues'),
    ('admin_reports','reports'), ('admin_report_status','reports'),
    ('admin_set_banned','ban'), ('admin_set_plan','plans'), ('admin_stats','stats'), ('admin_users','users')
  ) v(fn, perm) loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if d is null or position('perform admin_guard();' in d) = 0 then raise exception 'guarda não encontrada em %', r.fn; end if;
    d := replace(d, 'perform admin_guard();', format('perform admin_guard(%L);', r.perm));
    if r.fn = 'admin_users' then
      d := replace(d, '''admin'', is_app_admin(u.id),', '''admin'', is_app_admin(u.id), ''admin_role'', admin_role(u.id),');
    end if;
    execute d;
  end loop;

  -- só pode bloquear dono se for dono
  select pg_get_functiondef('public.admin_set_banned(uuid,boolean)'::regprocedure) into d;
  d := replace(d, 'if p_banned and is_app_admin(p_user) then', 'if p_banned and is_app_admin(p_user) and not has_admin_perm(''roles'') then');
  execute d;

  -- excluir a conta: o último dono não pode sair sem passar o acesso
  select pg_get_functiondef('public.delete_my_account(text)'::regprocedure) into d;
  d := replace(d, 'is_app_admin(me) and (select count(*) from app_admins) <= 1',
                  'admin_role(me) = ''owner'' and (select count(*) from app_admins where role = ''owner'') <= 1');
  d := replace(d, 'você é o único administrador', 'você é o único dono');
  execute d;
end $$;

-- configuração: cada parte do JSON exige a permissão da sua área (planos/cobrança só o dono)
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
      perform admin_guard(case when k = any(plan_keys) then 'plans' when k = 'ads' then 'ads' when k = 'community' then 'charts' else 'config' end);
    end if;
  end loop;
  insert into app_settings (key, value, updated_at, updated_by) values ('plans', p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;

-- papéis da equipe (só o dono)
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('roles');
  if p_role is not null and p_role not in ('owner', 'admin', 'moderator', 'curator', 'events', 'support') then
    raise exception 'papel inválido';
  end if;
  if p_user = auth.uid() then raise exception 'você não pode mudar o próprio acesso'; end if;
  if p_role is null then
    delete from app_admins where user_id = p_user;
  else
    insert into app_admins (user_id, added_by, role) values (p_user, auth.uid(), p_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;
end $$;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- compatibilidade com o app antigo: "tornar admin" vira Administrador geral
create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_set_role(p_user, case when p_admin then 'admin' end);
end $$;

-- equipe atual (para a aba Equipe)
create or replace function public.admin_staff()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('users');
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.user_id, 'role', a.role, 'since', a.created_at,
            'nickname', pr.nickname, 'avatar', pr.avatar_url, 'email', u.email)
            order by array_position(array['owner','admin','moderator','curator','events','support'], a.role), pr.nickname)
     from app_admins a join auth.users u on u.id = a.user_id
     left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = a.user_id
                         order by (p.version = 'phoenix2') desc, taken_at desc limit 1) pr on true), '[]'::jsonb);
end $$;
revoke all on function public.admin_staff() from public, anon;
grant execute on function public.admin_staff() to authenticated;

-- avisos para a equipe: pedidos de local/time só para quem cuida disso
create or replace function public.notify_admins(p_kind text, p_actor uuid, p_ref text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  select notify(a.user_id, p_kind, p_actor, p_ref, p_payload) from app_admins a
   where has_admin_perm(case when p_kind like 'admin_venue%' or p_kind like 'admin_team%' then 'venues' else 'stats' end, a.user_id);
$$;

-- o app recebe o papel e as permissões de quem está logado
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', plan_of(auth.uid()), 'source', s.source, 'expires_at', s.expires_at,
    'product', s.product, 'will_renew', s.will_renew,
    'admin', is_app_admin(auth.uid()), 'admin_role', admin_role(auth.uid()),
    'perms', to_jsonb(admin_perms(admin_role(auth.uid()))), 'config', app_config(),
    'tour_seen', coalesce((select us.tour_seen from user_settings us where us.user_id = auth.uid()), false),
    'friends', (select count(*) from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me and (s.expires_at is null or s.expires_at > now())
   where auth.uid() is not null
$$;

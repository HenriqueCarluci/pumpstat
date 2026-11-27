-- 080: Liberação de recursos por usuário. O admin dá um recurso pago a uma pessoa (com prazo e motivo)
-- sem mudar o plano dela. Vale no app e no servidor (plan_can), com ou sem a cobrança ligada.

create table if not exists public.user_feature_grants (
  user_id uuid not null references auth.users on delete cascade,
  feature text not null check (feature ~ '^[a-z_]{2,40}$'),
  expires_at timestamptz,
  note text check (length(note) <= 200),
  granted_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, feature)
);
alter table public.user_feature_grants enable row level security;

create or replace function public.has_feature_grant(p_user uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_feature_grants g where g.user_id = p_user and g.feature = p_feature
                  and (g.expires_at is null or g.expires_at > now()))
$$;
revoke all on function public.has_feature_grant(uuid, text) from public, anon, authenticated;

create or replace function public.plan_can(p_user uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  with s as (select preview_plan_of(p_user) as sim)
  select case
    when has_feature_grant(p_user, p_feature) then true
    when s.sim is null and (not coalesce((app_config()->>'enforce')::boolean, false) or coalesce(is_app_admin(p_user), false)) then true
    else array_position(array['free','plus','pro'], coalesce(s.sim, plan_of(p_user)))
         >= array_position(array['free','plus','pro'], coalesce(app_config()->'features'->>p_feature,
              ('{"missions_focus":"pro","training_list":"plus","day_report":"plus"}'::jsonb)->>p_feature, 'free'))
  end from s
$$;
revoke all on function public.plan_can(uuid, text) from public, anon, authenticated;

create or replace function public.admin_feature_grants(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('plans');
  return coalesce((select jsonb_agg(jsonb_build_object('feature', g.feature, 'expires_at', g.expires_at, 'note', g.note, 'created_at', g.created_at,
                      'active', g.expires_at is null or g.expires_at > now()) order by g.created_at desc)
                     from user_feature_grants g where g.user_id = p_user), '[]'::jsonb);
end $$;
revoke all on function public.admin_feature_grants(uuid) from public, anon;
grant execute on function public.admin_feature_grants(uuid) to authenticated;

create or replace function public.admin_set_feature_grant(p_user uuid, p_feature text, p_days int default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('plans');
  if p_feature !~ '^[a-z_]{2,40}$' then raise exception 'recurso inválido'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'usuário não encontrado'; end if;
  insert into user_feature_grants (user_id, feature, expires_at, note, granted_by)
  values (p_user, p_feature, case when p_days is null then null else now() + make_interval(days => least(greatest(p_days, 1), 3650)) end,
          nullif(left(btrim(coalesce(p_note, '')), 200), ''), auth.uid())
  on conflict (user_id, feature) do update set expires_at = excluded.expires_at, note = excluded.note,
     granted_by = excluded.granted_by, created_at = now();
end $$;
revoke all on function public.admin_set_feature_grant(uuid, text, int, text) from public, anon;
grant execute on function public.admin_set_feature_grant(uuid, text, int, text) to authenticated;

create or replace function public.admin_remove_feature_grant(p_user uuid, p_feature text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('plans');
  delete from user_feature_grants where user_id = p_user and feature = p_feature;
end $$;
revoke all on function public.admin_remove_feature_grant(uuid, text) from public, anon;
grant execute on function public.admin_remove_feature_grant(uuid, text) to authenticated;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', plan_of(auth.uid()), 'source', s.source, 'expires_at', s.expires_at,
    'product', s.product, 'will_renew', s.will_renew,
    'admin', is_app_admin(auth.uid()), 'admin_role', admin_role(auth.uid()),
    'perms', to_jsonb(admin_perms(admin_role(auth.uid()))), 'config', app_config(),
    'tour_seen', coalesce((select us.tour_seen from user_settings us where us.user_id = auth.uid()), false),
    'friends', (select count(*) from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)),
    'preview', (select jsonb_build_object('plan', p.plan, 'expires_at', p.expires_at) from admin_plan_preview p
                 where p.user_id = auth.uid() and p.expires_at > now() and coalesce(is_app_admin(auth.uid()), false)),
    'grants', coalesce((select jsonb_agg(g.feature) from user_feature_grants g
                         where g.user_id = auth.uid() and (g.expires_at is null or g.expires_at > now())), '[]'::jsonb))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me and (s.expires_at is null or s.expires_at > now())
   where auth.uid() is not null
$$;


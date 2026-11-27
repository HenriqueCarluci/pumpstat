-- 079: Modo de teste do admin. O admin simula um plano (Grátis, Plus ou Pro) por um tempo,
-- com a cobrança "ligada" só para ele, no app E no servidor (limites e recursos das funções).
-- Não muda a assinatura nem o perfil de administração: é só uma simulação que expira sozinha.

create table if not exists public.admin_plan_preview (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null check (plan in ('free', 'plus', 'pro')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.admin_plan_preview enable row level security;

create or replace function public.preview_plan_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select p.plan from admin_plan_preview p
   where p.user_id = p_user and p.expires_at > now() and coalesce(is_app_admin(p_user), false)
$$;
revoke all on function public.preview_plan_of(uuid) from public, anon, authenticated;

create or replace function public.plan_limit(p_user uuid, p_key text)
returns int language sql stable security definer set search_path = public as $$
  with s as (select preview_plan_of(p_user) as sim)
  select case
    when s.sim is not null then
      nullif(coalesce(app_config()->'limits'->s.sim->>p_key,
        ('{"free":{"friends":5,"missions":2,"mission_rerolls":0},"plus":{"friends":10,"missions":4,"mission_rerolls":1},"pro":{"missions":5,"mission_rerolls":2}}'::jsonb)->s.sim->>p_key), '')::int
    when coalesce((app_config()->>'enforce')::boolean, false) and not coalesce(is_app_admin(p_user), false) then
      nullif(coalesce(app_config()->'limits'->plan_of(p_user)->>p_key,
        ('{"free":{"friends":5,"missions":2,"mission_rerolls":0},"plus":{"friends":10,"missions":4,"mission_rerolls":1},"pro":{"missions":5,"mission_rerolls":2}}'::jsonb)->plan_of(p_user)->>p_key), '')::int
  end from s
$$;
revoke all on function public.plan_limit(uuid, text) from public, anon, authenticated;

create or replace function public.plan_can(p_user uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  with s as (select preview_plan_of(p_user) as sim)
  select case
    when s.sim is null and (not coalesce((app_config()->>'enforce')::boolean, false) or coalesce(is_app_admin(p_user), false)) then true
    else array_position(array['free','plus','pro'], coalesce(s.sim, plan_of(p_user)))
         >= array_position(array['free','plus','pro'], coalesce(app_config()->'features'->>p_feature,
              ('{"missions_focus":"pro","training_list":"plus","day_report":"plus"}'::jsonb)->>p_feature, 'free'))
  end from s
$$;
revoke all on function public.plan_can(uuid, text) from public, anon, authenticated;

create or replace function public.admin_set_preview(p_plan text, p_minutes int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r admin_plan_preview;
begin
  if not coalesce(is_app_admin(auth.uid()), false) then raise exception 'sem permissão para isso' using errcode = '42501'; end if;
  if p_plan is null or p_plan = '' then
    delete from admin_plan_preview where user_id = auth.uid();
    return null;
  end if;
  if p_plan not in ('free', 'plus', 'pro') then raise exception 'plano inválido'; end if;
  insert into admin_plan_preview (user_id, plan, expires_at)
  values (auth.uid(), p_plan, now() + make_interval(mins => least(greatest(coalesce(p_minutes, 60), 5), 1440)))
  on conflict (user_id) do update set plan = excluded.plan, started_at = now(), expires_at = excluded.expires_at
  returning * into r;
  return jsonb_build_object('plan', r.plan, 'expires_at', r.expires_at);
end $$;
revoke all on function public.admin_set_preview(text, int) from public, anon;
grant execute on function public.admin_set_preview(text, int) to authenticated;

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
                 where p.user_id = auth.uid() and p.expires_at > now() and coalesce(is_app_admin(auth.uid()), false)))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me and (s.expires_at is null or s.expires_at > now())
   where auth.uid() is not null
$$;

-- 053: o convite do tutorial guiado aparece uma vez só por conta (não por aparelho).
alter table public.user_settings add column if not exists tour_seen boolean not null default false;

create or replace function public.set_tour_seen()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into user_settings (user_id, tour_seen) values (auth.uid(), true)
  on conflict (user_id) do update set tour_seen = true;
  return true;
end $$;
revoke all on function public.set_tour_seen() from public, anon;
grant execute on function public.set_tour_seen() to authenticated;

-- my_plan passa a dizer se a pessoa já viu o tutorial
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', plan_of(auth.uid()), 'source', s.source, 'expires_at', s.expires_at,
    'product', s.product, 'will_renew', s.will_renew,
    'admin', is_app_admin(auth.uid()), 'config', app_config(),
    'tour_seen', coalesce((select us.tour_seen from user_settings us where us.user_id = auth.uid()), false),
    'friends', (select count(*) from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me and (s.expires_at is null or s.expires_at > now())
   where auth.uid() is not null
$$;

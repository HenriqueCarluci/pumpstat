-- Anúncios no plano grátis.
-- A configuração fica em app_settings.plans -> 'ads' (editada no painel do admin, junto dos planos):
--   enabled, show_admin, provider ('house' | 'adsense'), adsense_client, adsense_slot, every_n,
--   house: [{ id, title, text, url, image, cta, active, until }]
-- Anúncios próprios (house) contam só visualizações e cliques agregados por anúncio, para relatório a patrocinadores.

update public.app_settings
   set value = value || jsonb_build_object('ads', jsonb_build_object(
         'enabled', false, 'show_admin', false, 'provider', 'house',
         'adsense_client', '', 'adsense_slot', '', 'every_n', 12,
         'house', jsonb_build_array(jsonb_build_object(
           'id', 'plus', 'title', 'StepClub Plus', 'text', 'Sem anúncios, mais amigos e todas as recomendações para subir PUMBILITY.',
           'url', '#/planos', 'image', '', 'cta', 'Ver planos', 'active', true, 'until', null))))
 where key = 'plans' and not (value ? 'ads');

create table if not exists public.ad_events (
  id bigint generated always as identity primary key,
  ad_id text not null check (length(ad_id) between 1 and 40),
  kind text not null check (kind in ('view', 'click')),
  place text check (length(place) <= 20),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ad_events_ad_time on public.ad_events (ad_id, created_at desc);
alter table public.ad_events enable row level security;
revoke all on public.ad_events from anon, authenticated;

-- Registra visualização/clique. No máximo 1 visualização por anúncio, lugar e usuário a cada 10 minutos.
create or replace function public.log_ad_event(p_ad text, p_kind text, p_place text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_kind not in ('view', 'click') or coalesce(length(p_ad), 0) not between 1 and 40 then return; end if;
  if p_kind = 'view' and exists (
    select 1 from ad_events where user_id = me and ad_id = p_ad and kind = 'view'
       and coalesce(place, '') = coalesce(p_place, '') and created_at > now() - interval '10 minutes') then
    return;
  end if;
  insert into ad_events (ad_id, kind, place, user_id) values (p_ad, p_kind, left(p_place, 20), me);
end $$;
revoke all on function public.log_ad_event(text, text, text) from public, anon;
grant execute on function public.log_ad_event(text, text, text) to authenticated;

-- Relatório por anúncio (admin).
create or replace function public.admin_ad_stats(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((
    select jsonb_object_agg(ad_id, jsonb_build_object('views', views, 'clicks', clicks, 'people', people))
      from (select ad_id,
                   count(*) filter (where kind = 'view') views,
                   count(*) filter (where kind = 'click') clicks,
                   count(distinct user_id) people
              from ad_events where created_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
             group by ad_id) x), '{}'::jsonb);
end $$;
revoke all on function public.admin_ad_stats(int) from public, anon;
grant execute on function public.admin_ad_stats(int) to authenticated;

-- Lives da Twitch: checagem a cada 30 min (antes 2 min), e a função só chama a Twitch se a última rodada tem 25 min ou mais.
select cron.unschedule('pumpstat-twitch-live') where exists (select 1 from cron.job where jobname = 'pumpstat-twitch-live');
select cron.schedule('pumpstat-twitch-live', '*/30 * * * *', $$select public.twitch_tick()$$);
create or replace function public.twitch_check_due() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select ran_at < now() - interval '25 minutes' from twitch_check where id = 1), true)
$$;

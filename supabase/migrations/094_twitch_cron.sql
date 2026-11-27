-- Checagem das lives da Twitch a cada 2 min (só quando alguém preencheu a Twitch e o recurso está ligado).
-- A chave usada é a anon pública (a mesma que vai no app); a função faz o resto com a chave de serviço.
create extension if not exists pg_net;

create or replace function public.twitch_tick() returns void language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(public.twitch_logins()) = 0 then return; end if;
  perform net.http_post(
    url := 'https://jujbkgzkenktjuurrwvo.supabase.co/functions/v1/twitch-live',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1amJrZ3prZW5rdGp1dXJyd3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NTcwMDEsImV4cCI6MjExMTIzMzAwMX0.IZsqhX1l6jwqWj4HUH9NDXrxMEE-4p1hREFAKI3OZBw'),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
end $$;
revoke all on function public.twitch_tick() from public, anon, authenticated;

select cron.unschedule('pumpstat-twitch-live') where exists (select 1 from cron.job where jobname = 'pumpstat-twitch-live');
select cron.schedule('pumpstat-twitch-live', '*/2 * * * *', $$select public.twitch_tick()$$);

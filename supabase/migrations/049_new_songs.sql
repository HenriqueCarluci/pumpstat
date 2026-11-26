-- 049: músicas novas da versão (estão nesta versão e não estavam na anterior), para o filtro "Novas" do Tier.
create or replace function public.new_songs(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(s.id order by s.id), '[]'::jsonb)
    from songs s
   where p_version = 'phoenix2'
     and exists (select 1 from charts c where c.song_id = s.id and c.version = 'phoenix2')
     and not exists (select 1 from charts c where c.song_id = s.id and c.version = 'phoenix')
$$;
revoke all on function public.new_songs(text) from public;
grant execute on function public.new_songs(text) to anon, authenticated;

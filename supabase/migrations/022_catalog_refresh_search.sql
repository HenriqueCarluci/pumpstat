-- 022: controle da atualização diária do catálogo e busca de jogadores ordenada (começa com o termo primeiro)
create or replace function public.catalog_refresh_due(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  if p_key is null or p_key <> (select value from app_secrets where name = 'ingest_key') then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  select value::timestamptz into v_last from app_secrets where name = 'catalog_refreshed_at';
  if v_last is not null and v_last > now() - interval '20 hours' then return false; end if;
  insert into app_secrets (name, value) values ('catalog_refreshed_at', now()::text)
  on conflict (name) do update set value = excluded.value;
  return true;
end $$;
revoke all on function public.catalog_refresh_due(text) from public;
grant execute on function public.catalog_refresh_due(text) to anon, authenticated;

create or replace function public.search_players(p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by rk, nick), '[]'::jsonb) from (
    select profile_card(a.user_id) || jsonb_build_object('relation',
             case when are_friends(auth.uid(), a.user_id) then 'friends'
                  when exists (select 1 from friendships f where f.requester = auth.uid() and f.addressee = a.user_id) then 'pending_out'
                  when exists (select 1 from friendships f where f.requester = a.user_id and f.addressee = auth.uid()) then 'pending_in'
                  else 'none' end) x,
           case when n.nickname ilike trim(p_query) || '%' then 0 else 1 end rk, lower(n.nickname) nick
      from piu_accounts a
      join lateral (select p.nickname from user_profiles p where p.user_id = a.user_id and p.nickname is not null
                     order by p.taken_at desc limit 1) n on true
     where auth.uid() is not null and a.user_id <> auth.uid()
       and length(trim(p_query)) >= 2
       and n.nickname ilike '%' || trim(p_query) || '%'
     order by 2, 3
     limit 12) t
$$;

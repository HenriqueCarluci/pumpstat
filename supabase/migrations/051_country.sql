-- 051: país do jogador (bandeira no perfil). Opcional: a pessoa escolhe em Ajustes; vazio = sem bandeira.
alter table public.user_settings add column if not exists country text check (country ~ '^[A-Z]{2}$');

create or replace function public.set_my_country(p_cc text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v text := upper(nullif(trim(coalesce(p_cc, '')), ''));
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if v is not null and v !~ '^[A-Z]{2}$' then raise exception 'país inválido'; end if;
  insert into user_settings (user_id, country) values (me, v)
  on conflict (user_id) do update set country = excluded.country;
  return v;
end $$;

create or replace function public.my_country()
returns text language sql stable security definer set search_path = public as $$
  select country from user_settings where user_id = auth.uid()
$$;

-- bandeiras de vários jogadores de uma vez: [[id, "BR"], ...]
create or replace function public.countries_of(p_users uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(s.user_id, s.country)), '[]'::jsonb)
    from user_settings s
   where s.user_id = any(p_users[1:200]) and s.country is not null and auth.uid() is not null
$$;

revoke all on function public.set_my_country(text) from public, anon;
revoke all on function public.my_country() from public, anon;
revoke all on function public.countries_of(uuid[]) from public, anon;
grant execute on function public.set_my_country(text) to authenticated;
grant execute on function public.my_country() to authenticated;
grant execute on function public.countries_of(uuid[]) to authenticated;

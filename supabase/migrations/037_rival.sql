-- Rival: um amigo escolhido para comparar tudo na Phoenix 2.
alter table public.user_settings add column if not exists rival uuid references auth.users (id) on delete set null;

create or replace function public.set_my_rival(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user is not null and not are_friends(me, p_user) then raise exception 'O rival precisa ser seu amigo no PIU Stats.'; end if;
  insert into user_settings (user_id, rival) values (me, p_user)
  on conflict (user_id) do update set rival = excluded.rival;
end $$;
revoke all on function public.set_my_rival(uuid) from public, anon;
grant execute on function public.set_my_rival(uuid) to authenticated;

create or replace function public.my_rival()
returns uuid language sql stable security definer set search_path = public as $$
  select s.rival from user_settings s where s.user_id = auth.uid() and s.rival is not null and are_friends(auth.uid(), s.rival)
$$;
revoke all on function public.my_rival() from public, anon;
grant execute on function public.my_rival() to authenticated;

-- Amizades: as notas de outro jogador só aparecem depois que ele aprova a solicitação.
create table public.friendships (
  requester    uuid not null references auth.users (id) on delete cascade,
  addressee    uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index friendships_addressee_idx on public.friendships (addressee, status);
alter table public.friendships enable row level security;
create policy "participantes" on public.friendships for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a = b or exists (
    select 1 from friendships f where f.status = 'accepted'
       and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;  -- usada na policy de user_titles

-- perfil mais recente (sem notas) de um usuário
create or replace function public.profile_card(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p_user, 'nickname', p.nickname, 'title', p.title, 'avatar', p.avatar_url)
    from user_profiles p where p.user_id = p_user order by p.taken_at desc limit 1
$$;
revoke all on function public.profile_card(uuid) from public, anon, authenticated;

-- busca por nickname (mostra só nick, título e avatar — nada de notas)
create or replace function public.search_players(p_query text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select profile_card(a.user_id) || jsonb_build_object('relation',
             case when are_friends(auth.uid(), a.user_id) then 'friends'
                  when exists (select 1 from friendships f where f.requester = auth.uid() and f.addressee = a.user_id) then 'pending_out'
                  when exists (select 1 from friendships f where f.requester = a.user_id and f.addressee = auth.uid()) then 'pending_in'
                  else 'none' end) x
      from piu_accounts a
     where auth.uid() is not null and a.user_id <> auth.uid()
       and length(trim(p_query)) >= 2
       and exists (select 1 from user_profiles p where p.user_id = a.user_id and p.nickname ilike '%' || trim(p_query) || '%')
     limit 20) t
$$;
revoke all on function public.search_players(text) from public, anon;
grant execute on function public.search_players(text) to authenticated;

create or replace function public.send_friend_request(p_user uuid)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user = auth.uid() then raise exception 'você não pode adicionar a si mesmo'; end if;
  -- se o outro já tinha pedido, aceita direto
  if exists (select 1 from friendships where requester = p_user and addressee = auth.uid() and status = 'pending') then
    update friendships set status = 'accepted', responded_at = now() where requester = p_user and addressee = auth.uid();
    return 'accepted';
  end if;
  if (select count(*) from friendships where requester = auth.uid() and status = 'pending') >= 30 then
    raise exception 'muitas solicitações pendentes';
  end if;
  insert into friendships (requester, addressee) values (auth.uid(), p_user) on conflict do nothing;
  return 'pending';
end;
$$;

create or replace function public.respond_friend_request(p_user uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_accept then
    update friendships set status = 'accepted', responded_at = now()
     where requester = p_user and addressee = auth.uid() and status = 'pending';
  else
    delete from friendships where requester = p_user and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- desfaz amizade ou cancela pedido enviado
create or replace function public.remove_friend(p_user uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from friendships
   where (requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid() and status = 'accepted')
$$;

create or replace function public.friend_requests()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(profile_card(f.requester) || jsonb_build_object('at', f.created_at) order by f.created_at desc)
                            from friendships f where f.addressee = auth.uid() and f.status = 'pending'), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(profile_card(f.addressee) || jsonb_build_object('at', f.created_at) order by f.created_at desc)
                            from friendships f where f.requester = auth.uid() and f.status = 'pending'), '[]'::jsonb))
$$;

revoke all on function public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.friend_requests() from public, anon;
grant execute on function public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.friend_requests() to authenticated;

-- ---------- visibilidade passa a depender da amizade ----------
alter policy "dono ou publico" on public.user_titles using (are_friends(auth.uid(), user_id));

create or replace function public.players(p_version text default 'phoenix2')
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.user_id, 'me', a.user_id = auth.uid(),
           'nickname', pr.nickname, 'title', pr.title, 'avatar', pr.avatar_url, 'pumbility', pr.pumbility,
           'bests', (select count(*) from user_scores s join charts c on c.id = s.chart_id where s.user_id = a.user_id and c.version = p_version),
           'last_sync', a.last_sync_at)
         order by pr.pumbility desc nulls last), '[]'::jsonb)
    from piu_accounts a
    join lateral (select * from user_profiles p where p.user_id = a.user_id and p.version = p_version order by taken_at desc limit 1) pr on true
   where auth.uid() is not null and are_friends(auth.uid(), a.user_id)
$$;

create or replace function public.compare_player(p_other uuid, p_version text default 'phoenix2')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not are_friends(auth.uid(), p_other) then
    raise exception 'as notas só aparecem depois que o jogador aprovar sua solicitação';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_array(c.id, m.score, m.grade, m.plate, m.broken, o.score, o.grade, o.plate, o.broken)), '[]'::jsonb)
      from charts c
      left join user_scores m on m.chart_id = c.id and m.user_id = auth.uid()
      left join user_scores o on o.chart_id = c.id and o.user_id = p_other
     where c.version = p_version and (m.score is not null or o.score is not null)
  );
end;
$$;

create or replace function public.chart_ranking(p_chart_id bigint)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x order by (x->>'score')::int desc), '[]'::jsonb) from (
    select jsonb_build_object('id', s.user_id, 'me', s.user_id = auth.uid(), 'score', s.score, 'grade', s.grade,
             'plate', s.plate, 'broken', s.broken,
             'nickname', (select nickname from user_profiles p where p.user_id = s.user_id order by taken_at desc limit 1),
             'avatar', (select avatar_url from user_profiles p where p.user_id = s.user_id order by taken_at desc limit 1)) x
      from user_scores s
     where s.chart_id = p_chart_id and auth.uid() is not null and are_friends(auth.uid(), s.user_id)
     order by s.score desc limit 20) t
$$;

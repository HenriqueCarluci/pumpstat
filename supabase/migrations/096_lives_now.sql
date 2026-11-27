-- Selo AO VIVO: lives em andamento que eu posso ver (a minha, a dos amigos e a de quem deixou as redes para todos).
-- A checagem roda a cada 10 min, então a live some do selo se ficar mais de 25 min sem ser vista no ar.
create or replace function public.lives_now() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user', l.user_id, 'login', l.login, 'title', l.title, 'game', l.game, 'started_at', l.started_at)), '[]'::jsonb)
    from twitch_lives l
    join user_socials s on s.user_id = l.user_id
   where public.toggle_on('twitch_live') and auth.uid() is not null
     and l.ended_at is null and l.last_seen > now() - interval '25 minutes'
     and s.visibility <> 'hidden' and lower(s.twitch) = lower(l.login)
     and (l.user_id = auth.uid() or s.visibility = 'all'
          or exists (select 1 from friendships f where f.status = 'accepted'
                      and ((f.requester = auth.uid() and f.addressee = l.user_id) or (f.addressee = auth.uid() and f.requester = l.user_id))))
     and not exists (select 1 from user_blocks b where b.blocker = auth.uid() and b.blocked = l.user_id)
$$;
revoke all on function public.lives_now() from public, anon;
grant execute on function public.lives_now() to authenticated;

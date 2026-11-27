-- 087: Perfil privado. Com user_settings.private_stats ligado, ninguém (nem amigos) vê as estatísticas que o app gera
-- da pessoa: notas e recordes, jogadas, top 50, notas e placas, passes por nível, estilo, comparação, rival e avisos de recorde.
-- Continuam públicos os dados que o próprio jogo mostra: nick, foto, título e PUMBILITY (com a faixa); e também
-- bandeira, time e redes (que seguem a visibilidade própria). Vale nas telas sociais pelas views visible_* abaixo.

alter table public.user_settings add column if not exists private_stats boolean not null default false;

create or replace view public.visible_scores as
  select s.* from user_scores s
   where s.user_id = auth.uid()
      or not exists (select 1 from user_settings u where u.user_id = s.user_id and u.private_stats);
create or replace view public.visible_score_history as
  select h.* from user_score_history h
   where h.user_id = auth.uid()
      or not exists (select 1 from user_settings u where u.user_id = h.user_id and u.private_stats);
create or replace view public.visible_plays as
  select p.* from user_plays p
   where p.user_id = auth.uid()
      or not exists (select 1 from user_settings u where u.user_id = p.user_id and u.private_stats);
create or replace view public.visible_profiles as
  select p.id, p.user_id, p.version, p.nickname, p.title, p.avatar_url,
         p.pumbility,
         case when x.hidden then null else p.best_count end as best_count,
         p.taken_at
    from user_profiles p
    cross join lateral (select p.user_id is distinct from auth.uid()
                          and exists (select 1 from user_settings u where u.user_id = p.user_id and u.private_stats) as hidden) x;
revoke all on public.visible_scores, public.visible_score_history, public.visible_plays, public.visible_profiles from anon, authenticated;

create or replace function public.stats_private(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is distinct from auth.uid()
     and coalesce((select u.private_stats from user_settings u where u.user_id = p_user), false)
$$;
revoke all on function public.stats_private(uuid) from public, anon;
grant execute on function public.stats_private(uuid) to authenticated;

create or replace function public.my_privacy()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('private_stats', coalesce((select u.private_stats from user_settings u where u.user_id = auth.uid()), false))
   where auth.uid() is not null
$$;
revoke all on function public.my_privacy() from public, anon;
grant execute on function public.my_privacy() to authenticated;

create or replace function public.set_private_stats(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into user_settings (user_id, private_stats) values (auth.uid(), coalesce(p_on, false))
  on conflict (user_id) do update set private_stats = excluded.private_stats;
end $$;
revoke all on function public.set_private_stats(boolean) from public, anon;
grant execute on function public.set_private_stats(boolean) to authenticated;

-- telas que mostram dados de OUTRAS pessoas passam a ler as views (os próprios dados continuam visíveis)
do $$
declare f record; d text; n text;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public' and p.prokind = 'f'
              and p.proname in ('compare_player', 'players', 'chart_ranking', 'song_friend_scores', 'my_notifications',
                                'team_report', 'my_team', 'online_players', 'presence_card', 'profile_card', 'search_players',
                                'friends_in_queue', 'chart_reviews_for', 'my_week', 'missions_ctx', 'my_progress')
  loop
    d := pg_get_functiondef(f.oid);
    n := regexp_replace(d, '\muser_scores\M', 'visible_scores', 'g');
    n := regexp_replace(n, '\muser_score_history\M', 'visible_score_history', 'g');
    n := regexp_replace(n, '\muser_plays\M', 'visible_plays', 'g');
    n := regexp_replace(n, '\muser_profiles\M', 'visible_profiles', 'g');
    if n <> d then execute n; end if;
  end loop;
end $$;

-- players: marca quem deixou as estatísticas privadas
create or replace function public.players(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.user_id, 'me', a.user_id = auth.uid(),
           'nickname', pr.nickname, 'title', pr.title, 'avatar', pr.avatar_url, 'pumbility', pr.pumbility,
           'bests', case when stats_private(a.user_id) then null else
                      (select count(*) from user_scores s join charts c on c.id = s.chart_id where s.user_id = a.user_id and c.version = p_version) end,
           'private', stats_private(a.user_id),
           'last_sync', a.last_sync_at)
         order by pr.pumbility desc nulls last), '[]'::jsonb)
    from piu_accounts a
    join lateral (select * from visible_profiles p where p.user_id = a.user_id and p.version = p_version order by taken_at desc limit 1) pr on true
   where auth.uid() is not null and are_friends(auth.uid(), a.user_id)
$$;

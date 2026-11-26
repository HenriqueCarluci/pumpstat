-- Desafios do mês (cadastrados pelo admin, com brindes) e liga/desliga geral de recursos.
-- Os desafios medem só o esforço de cada um, para qualquer nível participar de igual para igual:
--   days        dias diferentes com jogo no período
--   plays       jogadas no período
--   new_clears  charts passados pela primeira vez no período (em qualquer nível)
--   improve     recordes pessoais batidos no período (chart já passado que ganhou nota maior)
--   song        charts da música escolhida passados no período (qualquer dificuldade)
--   grade       jogadas com a nota mínima escolhida (ou melhor), em qualquer nível
-- Prêmio: 'raffle' = sorteio entre quem completou; 'all' = todo mundo que completou ganha; 'top' = os N primeiros.

-- liga/desliga: app_config()->'toggles'->>'<recurso>' = false desliga (ausente = ligado)
create or replace function public.feature_on(p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((app_config()->'toggles'->>p_id)::boolean, true)
$$;
revoke all on function public.feature_on(text) from public, anon;
grant execute on function public.feature_on(text) to authenticated;

create table if not exists public.challenges (
  id bigint generated always as identity primary key,
  title text not null check (length(title) between 3 and 80),
  description text check (length(description) <= 600),
  kind text not null check (kind in ('days', 'plays', 'new_clears', 'improve', 'song', 'grade')),
  goal int not null check (goal between 1 and 1000),
  song_id bigint references public.songs (id) on delete set null,
  min_grade text check (min_grade in ('SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA+', 'AAA', 'AA+', 'AA', 'A+', 'A')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  prize text check (length(prize) <= 300),
  prize_mode text not null default 'raffle' check (prize_mode in ('raffle', 'all', 'top')),
  winners int not null default 1 check (winners between 1 and 100),
  active boolean not null default true,
  drawn_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'song' or song_id is not null),
  check (kind <> 'grade' or min_grade is not null)
);
alter table public.challenges enable row level security;
revoke all on public.challenges from anon, authenticated;

create table if not exists public.challenge_entries (
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.challenge_entries enable row level security;
revoke all on public.challenge_entries from anon, authenticated;

create table if not exists public.challenge_winners (
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  place int,
  progress int,
  delivered boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.challenge_winners enable row level security;
revoke all on public.challenge_winners from anon, authenticated;

-- ordem das notas (para "nota mínima")
create or replace function public.grade_rank(g text)
returns int language sql immutable as $$
  select array_position(array['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA+', 'AAA', 'AA+', 'AA', 'A+', 'A', 'B', 'C', 'D', 'F'], g)
$$;

-- progresso de um jogador num desafio
create or replace function public.challenge_progress(p_challenge bigint, p_user uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare c challenges; v int;
begin
  select * into c from challenges where id = p_challenge;
  if not found then return 0; end if;
  if c.kind = 'days' then
    select count(distinct (p.played_at at time zone 'America/Sao_Paulo')::date) into v
      from user_plays p where p.user_id = p_user and p.played_at >= c.starts_at and p.played_at < c.ends_at;
  elsif c.kind = 'plays' then
    select count(*) into v from user_plays p where p.user_id = p_user and p.played_at >= c.starts_at and p.played_at < c.ends_at;
  elsif c.kind = 'grade' then
    select count(*) into v from user_plays p
     where p.user_id = p_user and p.played_at >= c.starts_at and p.played_at < c.ends_at
       and not p.broken and grade_rank(p.grade) <= grade_rank(c.min_grade);
  elsif c.kind = 'song' then
    select count(distinct p.chart_id) into v from user_plays p join charts ch on ch.id = p.chart_id
     where p.user_id = p_user and ch.song_id = c.song_id and not p.broken
       and p.played_at >= c.starts_at and p.played_at < c.ends_at;
  elsif c.kind = 'new_clears' then
    select count(distinct p.chart_id) into v from user_plays p
     where p.user_id = p_user and not p.broken and p.played_at >= c.starts_at and p.played_at < c.ends_at
       and not exists (select 1 from user_plays q where q.user_id = p_user and q.chart_id = p.chart_id and not q.broken and q.played_at < c.starts_at)
       and not exists (select 1 from user_score_history h where h.user_id = p_user and h.chart_id = p.chart_id and not h.broken and h.seen_at < c.starts_at);
  elsif c.kind = 'improve' then
    select count(distinct h.chart_id) into v from user_score_history h
     where h.user_id = p_user and not h.broken and h.seen_at >= c.starts_at and h.seen_at < c.ends_at
       and exists (select 1 from user_score_history o where o.user_id = p_user and o.chart_id = h.chart_id and not o.broken
                     and o.seen_at < h.seen_at and o.score < h.score);
  end if;
  return coalesce(v, 0);
end $$;
revoke all on function public.challenge_progress(bigint, uuid) from public, anon, authenticated;

create or replace function public.challenge_card(c challenges, me uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'kind', c.kind, 'goal', c.goal,
    'song', c.song_id, 'song_title', (select title from songs where id = c.song_id), 'min_grade', c.min_grade,
    'starts_at', c.starts_at, 'ends_at', c.ends_at, 'prize', c.prize, 'prize_mode', c.prize_mode, 'winners', c.winners,
    'active', c.active, 'drawn_at', c.drawn_at,
    'status', case when now() < c.starts_at then 'soon' when now() < c.ends_at then 'live' else 'ended' end,
    'joined', exists (select 1 from challenge_entries e where e.challenge_id = c.id and e.user_id = me),
    'progress', case when exists (select 1 from challenge_entries e where e.challenge_id = c.id and e.user_id = me)
                     then challenge_progress(c.id, me) end,
    'participants', (select count(*) from challenge_entries e where e.challenge_id = c.id),
    'won', exists (select 1 from challenge_winners w where w.challenge_id = c.id and w.user_id = me),
    'winner_list', (select coalesce(jsonb_agg(presence_card(me, w.user_id) || jsonb_build_object('place', w.place) order by w.place nulls last), '[]'::jsonb)
                      from challenge_winners w where w.challenge_id = c.id))
$$;
revoke all on function public.challenge_card(challenges, uuid) from public, anon, authenticated;

-- desafios abertos, os próximos e os encerrados nos últimos 45 dias
create or replace function public.list_challenges()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not feature_on('challenges') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(challenge_card(c, me) order by (now() >= c.ends_at), c.ends_at)
                     from challenges c where c.active and c.ends_at > now() - interval '45 days'), '[]'::jsonb);
end $$;
revoke all on function public.list_challenges() from public, anon;
grant execute on function public.list_challenges() to authenticated;

create or replace function public.join_challenge(p_id bigint, p_join boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not feature_on('challenges') then raise exception 'os desafios estão desligados no momento'; end if;
  select * into c from challenges where id = p_id and active;
  if not found then raise exception 'desafio não encontrado'; end if;
  if now() >= c.ends_at then raise exception 'esse desafio já terminou'; end if;
  if p_join then
    insert into challenge_entries (challenge_id, user_id) values (p_id, me) on conflict do nothing;
  else
    delete from challenge_entries where challenge_id = p_id and user_id = me;
  end if;
  return challenge_card(c, me);
end $$;
revoke all on function public.join_challenge(bigint, boolean) from public, anon;
grant execute on function public.join_challenge(bigint, boolean) to authenticated;

-- quadro de quem participa (progresso de cada um)
create or replace function public.challenge_board(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select * into c from challenges where id = p_id and active;
  if not found then raise exception 'desafio não encontrado'; end if;
  return coalesce((select jsonb_agg(x.card || jsonb_build_object('progress', x.pr, 'done', x.pr >= c.goal, 'me', x.user_id = me)
                                    order by least(x.pr, c.goal) desc, x.joined_at)
                     from (select e.user_id, e.joined_at, challenge_progress(c.id, e.user_id) as pr, presence_card(me, e.user_id) as card
                             from challenge_entries e where e.challenge_id = c.id
                              and not is_blocked(me, e.user_id)) x), '[]'::jsonb);
end $$;
revoke all on function public.challenge_board(bigint) from public, anon;
grant execute on function public.challenge_board(bigint) to authenticated;

-- ---------- admin ----------
create or replace function public.admin_challenges()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(challenge_card(c, auth.uid()) || jsonb_build_object(
             'completed', (select count(*) from challenge_entries e where e.challenge_id = c.id and challenge_progress(c.id, e.user_id) >= c.goal),
             'winner_list', (select coalesce(jsonb_agg(presence_card(auth.uid(), w.user_id) || jsonb_build_object('place', w.place, 'progress', w.progress,
                               'delivered', w.delivered, 'email', (select email from auth.users u where u.id = w.user_id)) order by w.place nulls last), '[]'::jsonb)
                              from challenge_winners w where w.challenge_id = c.id))
           order by c.starts_at desc) from challenges c), '[]'::jsonb);
end $$;
revoke all on function public.admin_challenges() from public, anon;
grant execute on function public.admin_challenges() to authenticated;

create or replace function public.admin_save_challenge(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; v_new boolean := v_id is null;
begin
  perform admin_guard();
  if v_new then
    insert into challenges (title, description, kind, goal, song_id, min_grade, starts_at, ends_at, prize, prize_mode, winners, active, created_by)
    values (trim(p->>'title'), nullif(trim(p->>'description'), ''), p->>'kind', (p->>'goal')::int,
            case when p->>'kind' = 'song' then nullif(p->>'song_id', '')::bigint end,
            case when p->>'kind' = 'grade' then nullif(p->>'min_grade', '') end,
            (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz, nullif(trim(p->>'prize'), ''),
            coalesce(nullif(p->>'prize_mode', ''), 'raffle'), coalesce(nullif(p->>'winners', '')::int, 1),
            coalesce((p->>'active')::boolean, true), auth.uid())
    returning id into v_id;
    -- avisa todo mundo que tem perfil da Pump
    if coalesce((p->>'active')::boolean, true) and feature_on('challenges') then
      insert into notifications (user_id, kind, actor, ref, payload)
      select distinct u.user_id, 'challenge_new', null::uuid, v_id::text, jsonb_build_object('title', trim(p->>'title'), 'challenge', v_id)
        from user_profiles u where u.user_id is distinct from auth.uid();
    end if;
  else
    update challenges set title = trim(p->>'title'), description = nullif(trim(p->>'description'), ''), kind = p->>'kind',
           goal = (p->>'goal')::int,
           song_id = case when p->>'kind' = 'song' then nullif(p->>'song_id', '')::bigint end,
           min_grade = case when p->>'kind' = 'grade' then nullif(p->>'min_grade', '') end,
           starts_at = (p->>'starts_at')::timestamptz, ends_at = (p->>'ends_at')::timestamptz,
           prize = nullif(trim(p->>'prize'), ''), prize_mode = coalesce(nullif(p->>'prize_mode', ''), 'raffle'),
           winners = coalesce(nullif(p->>'winners', '')::int, 1), active = coalesce((p->>'active')::boolean, true)
     where id = v_id;
    if not found then raise exception 'desafio não encontrado'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.admin_save_challenge(jsonb) from public, anon;
grant execute on function public.admin_save_challenge(jsonb) to authenticated;

-- premiação: sorteio entre quem completou, todo mundo que completou ou os N primeiros
create or replace function public.admin_draw_challenge(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c challenges; r record; n int := 0;
begin
  perform admin_guard();
  select * into c from challenges where id = p_id for update;
  if not found then raise exception 'desafio não encontrado'; end if;
  delete from challenge_winners where challenge_id = p_id;
  for r in
    select e.user_id, challenge_progress(c.id, e.user_id) as pr, e.joined_at from challenge_entries e where e.challenge_id = c.id
  loop
    if c.prize_mode <> 'top' and r.pr < c.goal then continue; end if;
    if r.pr <= 0 then continue; end if;
    insert into challenge_winners (challenge_id, user_id, progress) values (p_id, r.user_id, r.pr);
  end loop;
  if c.prize_mode = 'raffle' then
    delete from challenge_winners w where w.challenge_id = p_id and w.user_id not in (
      select user_id from challenge_winners where challenge_id = p_id order by random() limit c.winners);
  elsif c.prize_mode = 'top' then
    delete from challenge_winners w where w.challenge_id = p_id and w.user_id not in (
      select x.user_id from challenge_winners x join challenge_entries e on e.challenge_id = p_id and e.user_id = x.user_id
       where x.challenge_id = p_id order by x.progress desc, e.joined_at limit c.winners);
  end if;
  update challenge_winners w set place = z.rn
    from (select user_id, row_number() over (order by progress desc, random()) rn from challenge_winners where challenge_id = p_id) z
   where w.challenge_id = p_id and w.user_id = z.user_id;
  update challenges set drawn_at = now() where id = p_id;
  for r in select user_id from challenge_winners where challenge_id = p_id loop
    perform notify(r.user_id, 'challenge_won', auth.uid(), p_id::text, jsonb_build_object('title', c.title, 'prize', c.prize, 'challenge', p_id));
    n := n + 1;
  end loop;
  return jsonb_build_object('winners', n);
end $$;
revoke all on function public.admin_draw_challenge(bigint) from public, anon;
grant execute on function public.admin_draw_challenge(bigint) to authenticated;

create or replace function public.admin_mark_prize(p_id bigint, p_user uuid, p_delivered boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update challenge_winners set delivered = coalesce(p_delivered, false) where challenge_id = p_id and user_id = p_user;
end $$;
revoke all on function public.admin_mark_prize(bigint, uuid, boolean) from public, anon;
grant execute on function public.admin_mark_prize(bigint, uuid, boolean) to authenticated;

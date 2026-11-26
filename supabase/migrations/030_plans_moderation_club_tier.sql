-- 030: planos Grátis/Plus/Pro configuráveis pelo admin, limite de amigos, bloquear/denunciar,
--      excluir conta e tier do clube (override do admin)

-- ---------- configuração do app (editável pelo admin) ----------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value) values ('plans', jsonb_build_object(
  'show_plans', false,          -- tela de planos visível para todos (admin sempre vê)
  'enforce', false,             -- limites e recursos pagos valendo (em dev: todo mundo tem tudo)
  'features', jsonb_build_object(
    'recommendations_all', 'plus', 'history_full', 'plus', 'style_full', 'plus',
    'evolution_chart', 'plus', 'export', 'plus',
    'auto_sync', 'pro', 'push', 'pro', 'training_plan', 'pro', 'weakness', 'pro'),
  'limits', jsonb_build_object(
    'free', jsonb_build_object('friends', 15, 'recommendations', 5, 'history_months', 3),
    'plus', jsonb_build_object('friends', 50),
    'pro', jsonb_build_object()),
  'prices', jsonb_build_object(
    'BR', jsonb_build_object('currency', 'BRL', 'plus', 6.90, 'plus_year', 54.90, 'pro', 12.90, 'pro_year', 99.90),
    'US', jsonb_build_object('currency', 'USD', 'plus', 4.99, 'plus_year', 39.99, 'pro', 9.99, 'pro_year', 79.99),
    'EU', jsonb_build_object('currency', 'USD', 'plus', 4.99, 'plus_year', 39.99, 'pro', 9.99, 'pro_year', 79.99),
    'WORLD', jsonb_build_object('currency', 'USD', 'plus', 2.99, 'plus_year', 24.99, 'pro', 5.99, 'pro_year', 49.99))
)) on conflict (key) do nothing;

create or replace function public.app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'plans'), '{}'::jsonb)
$$;
revoke all on function public.app_config() from public;
grant execute on function public.app_config() to anon, authenticated;

create or replace function public.admin_set_config(p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if jsonb_typeof(p_value) <> 'object' then raise exception 'opção inválida'; end if;
  insert into app_settings (key, value, updated_at, updated_by) values ('plans', p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.admin_set_config(jsonb) from public, anon;
grant execute on function public.admin_set_config(jsonb) to authenticated;

-- ---------- planos ----------
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('plus', 'pro'));
update public.subscriptions set plan = 'pro' where source = 'lifetime' and note = 'dono do app';

create or replace function public.plan_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select plan from subscriptions s where s.user_id = p_user and (s.expires_at is null or s.expires_at > now())), 'free')
$$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', plan_of(auth.uid()), 'source', s.source, 'expires_at', s.expires_at,
    'admin', is_app_admin(auth.uid()), 'config', app_config(),
    'friends', (select count(*) from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)))
    from (select auth.uid() as me) x
    left join subscriptions s on s.user_id = x.me and (s.expires_at is null or s.expires_at > now())
   where auth.uid() is not null
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- limite de amigos do usuário (null = sem limite ou cobrança desligada)
create or replace function public.friend_limit(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when coalesce((app_config()->>'enforce')::boolean, false)
              then nullif(app_config()->'limits'->plan_of(p_user)->>'friends', '')::int end
$$;
revoke all on function public.friend_limit(uuid) from public, anon, authenticated;

create or replace function public.friend_count(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from friendships f where f.status = 'accepted' and p_user in (f.requester, f.addressee)
$$;
revoke all on function public.friend_count(uuid) from public, anon, authenticated;

create or replace function public.check_friend_room(p_me uuid, p_other uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare l int;
begin
  l := friend_limit(p_me);
  if l is not null and friend_count(p_me) >= l then
    raise exception 'você chegou ao limite de amigos do seu plano';
  end if;
  l := friend_limit(p_other);
  if l is not null and friend_count(p_other) >= l then
    raise exception 'essa pessoa chegou ao limite de amigos do plano dela';
  end if;
end $$;
revoke all on function public.check_friend_room(uuid, uuid) from public, anon, authenticated;

-- ---------- bloquear e denunciar ----------
create table if not exists public.user_blocks (
  blocker    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.user_blocks enable row level security;
drop policy if exists "dono" on public.user_blocks;
create policy "dono" on public.user_blocks for select to authenticated using (blocker = auth.uid());
revoke insert, update, delete on public.user_blocks from anon, authenticated;

create table if not exists public.user_reports (
  id         bigint generated always as identity primary key,
  reporter   uuid references auth.users(id) on delete set null,
  reported   uuid references auth.users(id) on delete cascade,
  reason     text not null check (reason in ('spam', 'abuse', 'cheating', 'inappropriate', 'other')),
  details    text check (char_length(details) <= 1000),
  context    jsonb not null default '{}',
  status     text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;

-- true se um dos dois bloqueou o outro
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
revoke all on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

create or replace function public.block_user(p_user uuid, p_block boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user = auth.uid() then raise exception 'opção inválida'; end if;
  if p_block then
    insert into user_blocks (blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
    delete from friendships where (requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid());
    update play_invites set status = 'declined', responded_at = now()
     where status = 'pending' and from_user = p_user and to_user = auth.uid();
  else
    delete from user_blocks where blocker = auth.uid() and blocked = p_user;
  end if;
end $$;
revoke all on function public.block_user(uuid, boolean) from public, anon;
grant execute on function public.block_user(uuid, boolean) to authenticated;

create or replace function public.my_blocks()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(profile_card(b.blocked) || jsonb_build_object('at', b.created_at) order by b.created_at desc), '[]')
    from user_blocks b where b.blocker = auth.uid()
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

create or replace function public.report_user(p_user uuid, p_reason text, p_details text default null, p_context jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if (select count(*) from user_reports where reporter = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'muitas mensagens na última hora. Tente mais tarde';
  end if;
  insert into user_reports (reporter, reported, reason, details, context)
  values (auth.uid(), p_user, p_reason, left(nullif(trim(coalesce(p_details, '')), ''), 1000), coalesce(p_context, '{}'));
end $$;
revoke all on function public.report_user(uuid, text, text, jsonb) from public, anon;
grant execute on function public.report_user(uuid, text, text, jsonb) to authenticated;

create or replace function public.admin_reports(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform admin_guard();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'details', r.details, 'context', r.context, 'status', r.status, 'at', r.created_at,
      'reporter', r.reporter, 'reporter_nick', (select nickname from user_profiles p where p.user_id = r.reporter order by taken_at desc limit 1),
      'reported', r.reported, 'reported_nick', (select nickname from user_profiles p where p.user_id = r.reported order by taken_at desc limit 1),
      'reported_email', (select email from auth.users u where u.id = r.reported),
      'reported_banned', (select banned_until > now() from auth.users u where u.id = r.reported),
      'reports_total', (select count(*) from user_reports r2 where r2.reported = r.reported)) order by r.created_at desc), '[]')
    from user_reports r where p_status = 'all' or r.status = p_status);
end $$;
revoke all on function public.admin_reports(text) from public, anon;
grant execute on function public.admin_reports(text) to authenticated;

create or replace function public.admin_report_status(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_status not in ('open', 'done') then raise exception 'opção inválida'; end if;
  update user_reports set status = p_status where id = p_id;
end $$;
revoke all on function public.admin_report_status(bigint, text) from public, anon;
grant execute on function public.admin_report_status(bigint, text) to authenticated;

-- ---------- amizades respeitam bloqueio e limite do plano ----------
create or replace function public.send_friend_request(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user = auth.uid() then raise exception 'você não pode adicionar a si mesmo'; end if;
  if is_blocked(auth.uid(), p_user) then raise exception 'não é possível adicionar este jogador'; end if;
  if exists (select 1 from friendships where requester = p_user and addressee = auth.uid() and status = 'pending') then
    perform check_friend_room(auth.uid(), p_user);
    update friendships set status = 'accepted', responded_at = now() where requester = p_user and addressee = auth.uid();
    return 'accepted';
  end if;
  perform check_friend_room(auth.uid(), p_user);
  if (select count(*) from friendships where requester = auth.uid() and status = 'pending') >= 30 then
    raise exception 'muitas solicitações pendentes';
  end if;
  insert into friendships (requester, addressee) values (auth.uid(), p_user) on conflict do nothing;
  return 'pending';
end $$;

create or replace function public.respond_friend_request(p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    perform check_friend_room(auth.uid(), p_user);
    update friendships set status = 'accepted', responded_at = now()
     where requester = p_user and addressee = auth.uid() and status = 'pending';
  else
    delete from friendships where requester = p_user and addressee = auth.uid() and status = 'pending';
  end if;
end $$;

-- ---------- excluir a própria conta (apaga todos os dados ligados a ela) ----------
create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if upper(trim(coalesce(p_confirm, ''))) <> 'EXCLUIR' then raise exception 'digite EXCLUIR para confirmar'; end if;
  if is_app_admin(me) and (select count(*) from app_admins) <= 1 then
    raise exception 'você é o único administrador. Passe o acesso para outra pessoa antes de excluir a conta';
  end if;
  delete from auth.users where id = me;
end $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- ---------- tier do clube (override do admin) ----------
create table if not exists public.chart_tier_overrides (
  chart_id   bigint primary key references public.charts(id) on delete cascade,
  tier       smallint not null check (tier between -2 and 2),
  note       text,
  set_by     uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.chart_tier_overrides enable row level security;
revoke all on public.chart_tier_overrides from anon, authenticated;

create or replace function public.admin_set_chart_tier(p_chart bigint, p_tier smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_tier is null then
    delete from chart_tier_overrides where chart_id = p_chart;
  else
    insert into chart_tier_overrides (chart_id, tier, set_by) values (p_chart, p_tier, auth.uid())
    on conflict (chart_id) do update set tier = excluded.tier, set_by = auth.uid(), updated_at = now();
  end if;
end $$;
revoke all on function public.admin_set_chart_tier(bigint, smallint) from public, anon;
grant execute on function public.admin_set_chart_tier(bigint, smallint) to authenticated;

-- resumo por chart: [chart_id, média, votos, tags, tier do clube]
create or replace function public.community_charts(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.avg, x.votes, x.tags, o.tier)), '[]')
    from (
      select c.id as chart_id,
             (select round(avg(r.tier)::numeric, 2) from chart_reviews r where r.chart_id = c.id) avg,
             (select count(r.tier) from chart_reviews r where r.chart_id = c.id) votes,
             (select coalesce(jsonb_agg(t order by n desc), '[]') from
                (select t, count(*) n from chart_reviews r2, unnest(r2.tags) t where r2.chart_id = c.id
                  group by t order by n desc limit 3) z) tags
        from charts c
       where c.version = p_version
         and (exists (select 1 from chart_reviews r where r.chart_id = c.id)
              or exists (select 1 from chart_tier_overrides o2 where o2.chart_id = c.id))
    ) x
    left join chart_tier_overrides o on o.chart_id = x.chart_id
   where auth.uid() is not null
$$;
revoke all on function public.community_charts(text) from public, anon;
grant execute on function public.community_charts(text) to authenticated;

-- ---------- bloqueio aplicado em busca, online, convites, chat e comentários ----------
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
       and not is_blocked(auth.uid(), a.user_id)
       and length(trim(p_query)) >= 2
       and n.nickname ilike '%' || trim(p_query) || '%'
     order by 2, 3
     limit 12) t
$$;

create or replace function public.online_players()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_pb numeric; v_venue text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select pumbility into v_pb from user_profiles where user_id = me and version = 'phoenix2' order by taken_at desc limit 1;
  select venue_slug into v_venue from user_presence where user_id = me;
  return (
    select coalesce(jsonb_agg(card order by same_venue desc, diff nulls last, friend desc), '[]') from (
      select presence_card(me, p.user_id) || jsonb_build_object(
               'same_venue', v_venue is not null and p.venue_slug = v_venue,
               'venue', (select name from venues v where v.slug = p.venue_slug),
               'max', max_cleared(p.user_id),
               'match', case when v_pb is null or pb.pumbility is null then null
                             when abs(pb.pumbility - v_pb) <= 500 then 'close'
                             when abs(pb.pumbility - v_pb) <= 1500 then 'near' else 'far' end,
               'pumbility', pb.pumbility,
               'invited', exists (select 1 from play_invites i where i.from_user = me and i.to_user = p.user_id
                                   and i.status = 'pending' and i.created_at > now() - interval '2 hours'),
               'since', p.last_seen) as card,
             (v_venue is not null and p.venue_slug = v_venue) as same_venue,
             abs(pb.pumbility - v_pb) as diff,
             are_friends(me, p.user_id) as friend
        from user_presence p
        left join lateral (select pumbility from user_profiles u where u.user_id = p.user_id and u.version = 'phoenix2'
                            order by taken_at desc limit 1) pb on true
       where p.user_id <> me and p.last_seen > now() - interval '3 minutes'
         and not is_blocked(me, p.user_id)
         and (p.mode = 'all' or (p.mode = 'friends' and are_friends(me, p.user_id)))
    ) z);
end $$;

create or replace function public.send_invite(p_user uuid, p_message text default null, p_kind text default 'invite')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_venue text; v_msg text := left(nullif(trim(coalesce(p_message, '')), ''), 140);
  v_online boolean; v_friend boolean;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_user = me then raise exception 'você não pode convidar a si mesmo'; end if;
  if p_kind not in ('invite', 'message') then raise exception 'opção inválida'; end if;
  if is_blocked(me, p_user) then raise exception 'não é possível falar com este jogador'; end if;
  v_friend := are_friends(me, p_user);
  v_online := exists (select 1 from user_presence p where p.user_id = p_user and p.last_seen > now() - interval '3 minutes'
                       and (p.mode = 'all' or (p.mode = 'friends' and v_friend)));
  if p_kind = 'message' then
    if not v_friend then raise exception 'só dá para mandar mensagem para amigos'; end if;
    if v_msg is null then raise exception 'escreva uma mensagem'; end if;
    if exists (select 1 from play_invites where from_user = me and to_user = p_user and created_at > now() - interval '3 seconds') then
      raise exception 'espere alguns segundos antes de mandar outra';
    end if;
  else
    if not v_online and not v_friend then raise exception 'essa pessoa não está mais online'; end if;
    if exists (select 1 from play_invites where from_user = me and to_user = p_user and kind = 'invite'
                and created_at > now() - interval '10 minutes') then
      raise exception 'você já chamou essa pessoa há pouco. Espere a resposta';
    end if;
  end if;
  if (select count(*) from play_invites where from_user = me and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'muitos convites na última hora. Tente mais tarde';
  end if;
  select venue_slug into v_venue from user_presence where user_id = me;
  insert into play_invites (from_user, to_user, message, venue_slug, kind) values (me, p_user, v_msg, v_venue, p_kind);
  return jsonb_build_object('sent', true, 'online', v_online);
end $$;

create or replace function public.chart_reviews_for(p_chart bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'votes', (select count(tier) from chart_reviews where chart_id = p_chart),
    'avg', (select round(avg(tier)::numeric, 2) from chart_reviews where chart_id = p_chart),
    'club_tier', (select tier from chart_tier_overrides where chart_id = p_chart),
    'dist', (select jsonb_object_agg(tier, n) from (select tier, count(*) n from chart_reviews
              where chart_id = p_chart and tier is not null group by tier) d),
    'tags', (select coalesce(jsonb_agg(jsonb_build_array(t, n) order by n desc, t), '[]') from
              (select t, count(*) n from chart_reviews r, unnest(r.tags) t where r.chart_id = p_chart group by t) x),
    'can_review', exists (select 1 from user_scores s where s.user_id = auth.uid() and s.chart_id = p_chart
                           and not coalesce(s.broken, false)),
    'mine', (select jsonb_build_object('tier', tier, 'tags', tags, 'comment', comment)
               from chart_reviews where chart_id = p_chart and user_id = auth.uid()),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
                    'user', r.user_id, 'me', r.user_id = auth.uid(), 'nickname', pr.nickname, 'avatar', pr.avatar_url,
                    'tier', r.tier, 'tags', r.tags, 'comment', r.comment, 'at', r.updated_at,
                    'grade', case when are_friends(auth.uid(), r.user_id) then s.grade end,
                    'plate', case when are_friends(auth.uid(), r.user_id) then s.plate end) order by r.updated_at desc), '[]')
                   from chart_reviews r
                   left join user_scores s on s.user_id = r.user_id and s.chart_id = r.chart_id
                   left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = r.user_id
                                       order by taken_at desc limit 1) pr on true
                  where r.chart_id = p_chart and r.comment is not null and not is_blocked(auth.uid(), r.user_id)))
  where auth.uid() is not null
$$;

-- 116: push de tudo o que chega no sino (além da fila), no navegador (Web Push) e no app Android (Firebase).
-- Cada pessoa escolhe em Ajustes quais tipos viram push e pode ter um horário de silêncio (a fila sempre avisa).

-- aparelhos Android (token do Firebase Cloud Messaging)
create table if not exists public.push_fcm (
  token text primary key check (length(token) between 20 and 4096),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists push_fcm_user on public.push_fcm (user_id);
alter table public.push_fcm enable row level security;
revoke all on public.push_fcm from anon, authenticated;

-- preferências: categorias desligadas, silêncio (horas locais, de/até) e fuso
create table if not exists public.push_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  off text[] not null default array['friends_activity']::text[],
  quiet boolean not null default false,
  quiet_from smallint not null default 0 check (quiet_from between 0 and 23),
  quiet_to smallint not null default 8 check (quiet_to between 0 and 23),
  tz text not null default 'America/Sao_Paulo' check (length(tz) <= 60),
  updated_at timestamptz not null default now()
);
alter table public.push_prefs enable row level security;
revoke all on public.push_prefs from anon, authenticated;

alter table public.notifications add column if not exists pushed_at timestamptz;

-- categoria de cada tipo de aviso (null = nunca vira push)
create or replace function public.push_category(p_kind text)
 returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'chat'
    when p_kind = 'invite' then 'invites'
    when p_kind in ('friend_request', 'friend_accepted', 'friend_new') then 'friends'
    when p_kind in ('friend_live', 'friend_pumbility', 'friend_online') then 'friends_activity'
    when p_kind like 'team\_%' then 'team'
    when p_kind in ('app_update', 'feedback_reply') then 'app'
    when p_kind like 'admin\_%' then 'admin'
    when p_kind in ('challenge_new', 'challenge_won', 'badge', 'tier_vote_result', 'piu_link_moved')
      or p_kind like 'venue\_%' then 'other'
    else null end
$$;

create or replace function public.push_prefs_get()
 returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'off', coalesce(p.off, array['friends_activity']::text[]),
    'quiet', coalesce(p.quiet, false), 'quiet_from', coalesce(p.quiet_from, 0), 'quiet_to', coalesce(p.quiet_to, 8),
    'web', exists (select 1 from push_subscriptions s where s.user_id = auth.uid()),
    'android', exists (select 1 from push_fcm f where f.user_id = auth.uid()))
    from (select 1) one left join push_prefs p on p.user_id = auth.uid()
$$;
grant execute on function public.push_prefs_get() to authenticated;

create or replace function public.push_prefs_set(p_off text[], p_quiet boolean, p_from int, p_to int, p_tz text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into push_prefs (user_id, off, quiet, quiet_from, quiet_to, tz, updated_at)
  values (auth.uid(),
          (select coalesce(array_agg(distinct c), '{}') from unnest(coalesce(p_off, '{}')) c
            where c in ('chat', 'invites', 'friends', 'friends_activity', 'team', 'app', 'admin', 'other')),
          coalesce(p_quiet, false), greatest(0, least(23, coalesce(p_from, 0))), greatest(0, least(23, coalesce(p_to, 8))),
          coalesce(nullif(left(trim(coalesce(p_tz, '')), 60), ''), 'America/Sao_Paulo'), now())
  on conflict (user_id) do update set off = excluded.off, quiet = excluded.quiet, quiet_from = excluded.quiet_from,
    quiet_to = excluded.quiet_to, tz = excluded.tz, updated_at = now();
end $$;
grant execute on function public.push_prefs_set(text[], boolean, int, int, text) to authenticated;

-- app Android: grava o token do aparelho para a conta logada
create or replace function public.push_fcm_register(p_token text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if coalesce(p_token, '') = '' or length(p_token) > 4096 then raise exception 'token inválido'; end if;
  insert into push_fcm (token, user_id) values (p_token, auth.uid())
  on conflict (token) do update set user_id = auth.uid(), seen_at = now();
end $$;
grant execute on function public.push_fcm_register(text) to authenticated;

create or replace function public.push_fcm_unregister(p_token text)
 returns void language sql security definer set search_path to 'public' as $$
  delete from push_fcm where token = p_token and user_id = auth.uid()
$$;
grant execute on function public.push_fcm_unregister(text) to authenticated;

create or replace function public.push_fcm_drop(p_key text, p_token text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  delete from push_fcm where token = p_token;
end $$;
revoke all on function public.push_fcm_drop(text, text) from public, anon, authenticated;
grant execute on function public.push_fcm_drop(text, text) to anon;

-- título, texto, link e imagem de cada aviso
create or replace function public.push_text(n notifications)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare who text; pic text; p jsonb := coalesce(n.payload, '{}'::jsonb); body text; url text := '/#/';
begin
  if n.actor is not null then
    select coalesce(nickname, 'Alguém'), avatar_url into who, pic from visible_profiles where user_id = n.actor order by taken_at desc limit 1;
    who := coalesce(who, account_label(n.actor), 'Alguém');
  end if;
  case n.kind
    when 'message' then body := who || ': ' || left(coalesce(p->>'message', 'nova mensagem'), 160); url := '/#/jogador/' || n.actor;
    when 'invite' then body := who || ' te chamou para jogar' || coalesce(': ' || left(p->>'message', 120), '');
      url := case when p->>'venue' is not null then '/#/fila/' || (p->>'venue') else '/#/online' end;
    when 'friend_request' then body := who || ' quer ser seu amigo'; url := '/#/jogadores?tab=requests';
    when 'friend_accepted' then body := who || ' aceitou seu pedido de amizade'; url := '/#/jogador/' || n.actor;
    when 'friend_new' then body := who || ' agora é seu amigo'; url := '/#/jogador/' || n.actor;
    when 'friend_live' then body := who || ' está ao vivo'; url := '/#/jogador/' || n.actor;
    when 'friend_pumbility' then body := who || ' subiu de PUMBILITY'; url := '/#/jogador/' || n.actor;
    when 'team_join_request' then body := 'Pedido para entrar no time ' || coalesce(p->>'name', ''); url := '/#/time';
    when 'team_join_approved' then body := 'Você entrou no time ' || coalesce(p->>'name', ''); url := '/#/time';
    when 'team_admin' then body := 'Você agora é admin do time ' || coalesce(p->>'name', ''); url := '/#/time';
    when 'app_update' then body := 'Versão nova do app para teste (' || coalesce(p->>'version', '') || '). Toque para atualizar.';
      url := coalesce(p->>'link', '/#/');
    when 'feedback_reply' then body := case when p->>'status' = 'fixed' then 'Seu report #' || (p->>'id') || ' foi corrigido'
                                          else 'Resposta ao seu report #' || (p->>'id') end
                                     || coalesce(': ' || left(p->>'reply', 140), ''); url := '/#/ajustes';
    when 'tier_vote_result' then body := 'Votação do tier encerrada: ' || coalesce(p->>'title', ''); url := '/#/tier';
    when 'admin_new_user' then body := 'Novo usuário no PIU Stats'; url := '/#/admin?tab=users'; pic := null;
    else body := 'Você tem um aviso novo no PIU Stats';
  end case;
  return jsonb_build_object('title', 'PIU Stats', 'body', body, 'url', url, 'image', pic, 'tag', n.kind || ':' || coalesce(n.ref, n.id::text));
end $$;
revoke all on function public.push_text(notifications) from public, anon, authenticated;

-- avisos novos que viram push agora: marca como enviados e devolve os destinos (navegador e Android)
create or replace function public.notif_push_due(p_key text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare out jsonb := '[]'::jsonb; r record; t jsonb;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  perform set_config('pumpstat.push_tick', 'off', true);
  for r in
    select n.*, push_category(n.kind) as cat, pp.off, pp.quiet, pp.quiet_from, pp.quiet_to, pp.tz
      from notifications n left join push_prefs pp on pp.user_id = n.user_id
     where n.created_at > now() - interval '15 minutes' and not coalesce(n.dismissed, false)
       and (n.pushed_at is null or n.pushed_at < n.created_at)
     order by n.created_at
     limit 300
     for update of n skip locked
  loop
    update notifications set pushed_at = now() where id = r.id;
    continue when r.cat is null or r.cat = any(coalesce(r.off, array['friends_activity']::text[]));
    if coalesce(r.quiet, false) then
      declare h int := extract(hour from now() at time zone coalesce(r.tz, 'America/Sao_Paulo'));
      begin
        continue when (r.quiet_from <= r.quiet_to and h >= r.quiet_from and h < r.quiet_to)
                   or (r.quiet_from > r.quiet_to and (h >= r.quiet_from or h < r.quiet_to));
      end;
    end if;
    t := push_text((select n from notifications n where n.id = r.id));
    out := out
      || coalesce((select jsonb_agg(t || jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                     from push_subscriptions s where s.user_id = r.user_id), '[]'::jsonb)
      || coalesce((select jsonb_agg(t || jsonb_build_object('fcm', f.token)) from push_fcm f where f.user_id = r.user_id), '[]'::jsonb);
  end loop;
  return out;
end $$;
revoke all on function public.notif_push_due(text) from public, anon, authenticated;
grant execute on function public.notif_push_due(text) to anon;

-- fila: também avisa no app Android de quem está na fila (ou de quem trouxe o convidado)
create or replace function public.queue_push_due(p_key text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare out jsonb := '[]'::jsonb; r record; t jsonb;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  perform set_config('pumpstat.push_tick', 'off', true);
  update queue_entries e set push_stage = 0
    from (select id, row_number() over (partition by machine_id order by pos) - 1 as rk
            from queue_entries where status = 'waiting') k
   where k.id = e.id and k.rk > 1 and e.push_stage > 0;
  for r in
    with ranked as (
      select e.*, row_number() over (partition by e.machine_id order by e.pos) - 1 as rk
        from queue_entries e where e.status = 'waiting'
    )
    select k.id, k.machine_id, k.user_id, k.guest_of, k.is_guest, k.display_name, k.rk,
           case when k.rk = 0 then 2 else 1 end as stage, m.name as machine, v.name as venue, v.slug
      from ranked k join machines m on m.id = k.machine_id join venues v on v.id = m.venue_id
     where k.rk <= 1 and k.push_stage < case when k.rk = 0 then 2 else 1 end
  loop
    update queue_entries set push_stage = r.stage where id = r.id;
    t := jsonb_build_object(
      'title', case when r.stage = 2 then case when r.is_guest then 'Vez do seu convidado ' || r.display_name else 'É a sua vez!' end
                    else case when r.is_guest then r.display_name || ' é o próximo' else 'Você é o próximo' end end,
      'body', r.venue || ' · ' || r.machine, 'url', '/#/fila/' || r.slug, 'tag', 'fila');
    out := out || coalesce((
      select jsonb_agg(t || jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from push_subscriptions s
       where (r.user_id is not null and s.user_id = r.user_id)
          or (r.guest_of is not null and s.user_id = r.guest_of)
          or exists (select 1 from queue_owners o where o.entry_id = r.id and o.device_hash = s.device_hash)), '[]'::jsonb)
      || coalesce((
      select jsonb_agg(t || jsonb_build_object('fcm', f.token))
        from push_fcm f
       where (r.user_id is not null and f.user_id = r.user_id) or (r.guest_of is not null and f.user_id = r.guest_of)), '[]'::jsonb);
  end loop;
  return out;
end $$;
revoke all on function public.queue_push_due(text) from public, anon, authenticated;
grant execute on function public.queue_push_due(text) to anon;

-- aviso novo (ou mensagem nova na mesma conversa): acorda o servidor
create or replace function public.tg_notif_push_tick()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if coalesce(current_setting('pumpstat.push_tick', true), '') = 'off' then return null; end if;
  if exists (select 1 from push_subscriptions where user_id is not null limit 1) or exists (select 1 from push_fcm limit 1) then
    perform net.http_post(url := 'https://pumpstat-api.onrender.com/api/push/queue-tick',
      headers := jsonb_build_object('Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 5000);
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists notif_push_tick on public.notifications;
create trigger notif_push_tick after insert or update of payload, created_at on public.notifications
  for each statement execute function public.tg_notif_push_tick();

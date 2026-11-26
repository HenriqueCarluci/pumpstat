-- Fila das máquinas (inspirada no Fila Pump), em tempo real.
-- Leitura pública; ações via RPC. Quem entra sem conta controla a própria vaga por um token do aparelho.

create table public.venues (
  id         bigint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  city       text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.venue_admins (
  venue_id bigint not null references public.venues (id) on delete cascade,
  user_id  uuid   not null references auth.users (id) on delete cascade,
  primary key (venue_id, user_id)
);

create table public.machines (
  id        bigint generated always as identity primary key,
  venue_id  bigint not null references public.venues (id) on delete cascade,
  name      text not null,
  sort      int not null default 0,
  active    boolean not null default true
);

create table public.queue_entries (
  id           bigint generated always as identity primary key,
  machine_id   bigint not null references public.machines (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar_url   text,
  status       text not null default 'waiting' check (status in ('waiting', 'away')),
  pos          double precision not null,     -- ordem na fila (menor = primeiro)
  joined_at    timestamptz not null default now(),
  away_since   timestamptz,
  turns        int not null default 0
);
create index queue_entries_machine_idx on public.queue_entries (machine_id, pos);

-- dono da vaga sem conta: sha256 do token do aparelho (tabela sem leitura pública)
create table public.queue_owners (
  entry_id    bigint primary key references public.queue_entries (id) on delete cascade,
  device_hash text not null
);

create table public.queue_events (
  id         bigint generated always as identity primary key,
  machine_id bigint not null references public.machines (id) on delete cascade,
  kind       text not null,                   -- join | pass | leave | away | back | remove | reset | expire
  entry_name text,
  at         timestamptz not null default now()
);
create index queue_events_machine_idx on public.queue_events (machine_id, at desc);

alter table public.venues        enable row level security;
alter table public.venue_admins  enable row level security;
alter table public.machines      enable row level security;
alter table public.queue_entries enable row level security;
alter table public.queue_events  enable row level security;
alter table public.queue_owners  enable row level security;

create policy "publico" on public.venues        for select to anon, authenticated using (true);
create policy "publico" on public.machines      for select to anon, authenticated using (true);
create policy "publico" on public.queue_entries for select to anon, authenticated using (true);
create policy "publico" on public.queue_events  for select to anon, authenticated using (true);
create policy "proprio" on public.venue_admins  for select to authenticated using (user_id = auth.uid());

alter publication supabase_realtime add table public.queue_entries, public.queue_events;

-- ---------- helpers ----------
create or replace function public.q_hash(p_token text) returns text
language sql immutable as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;

create or replace function public.q_is_admin(p_machine bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from machines m join venue_admins a on a.venue_id = m.venue_id
     where m.id = p_machine and a.user_id = auth.uid())
$$;

-- a vaga é de quem: conta logada, token do aparelho ou admin do local
create or replace function public.q_can_edit(p_entry public.queue_entries, p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is not null and p_entry.user_id = auth.uid())
      or (p_token is not null and exists (select 1 from queue_owners o where o.entry_id = p_entry.id and o.device_hash = q_hash(p_token)))
      or q_is_admin(p_entry.machine_id)
$$;

create or replace function public.q_log(p_machine bigint, p_kind text, p_name text) returns void
language sql security definer set search_path = public as $$
  insert into queue_events (machine_id, kind, entry_name) values (p_machine, p_kind, p_name)
$$;

-- ---------- ações ----------
create or replace function public.queue_join(p_machine bigint, p_name text default null, p_token text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_name   text;
  v_avatar text;
  v_id     bigint;
begin
  if not exists (select 1 from machines where id = p_machine and active) then
    raise exception 'máquina não encontrada';
  end if;
  if auth.uid() is null and coalesce(p_token, '') = '' then
    raise exception 'aparelho sem identificação';
  end if;
  -- já está na fila desta máquina?
  select id into v_id from queue_entries
   where machine_id = p_machine
     and ((auth.uid() is not null and user_id = auth.uid())
          or (p_token is not null and exists (select 1 from queue_owners o where o.entry_id = queue_entries.id and o.device_hash = q_hash(p_token))));
  if v_id is not null then return v_id; end if;

  if auth.uid() is not null then
    select coalesce(nullif(split_part(nickname, ' #', 1), ''), null), avatar_url into v_name, v_avatar
      from user_profiles where user_id = auth.uid() order by taken_at desc limit 1;
  end if;
  v_name := left(trim(coalesce(nullif(trim(p_name), ''), v_name, 'Jogador')), 24);

  insert into queue_entries (machine_id, user_id, display_name, avatar_url, pos)
  values (p_machine, auth.uid(), v_name, v_avatar,
          coalesce((select max(pos) from queue_entries where machine_id = p_machine), 0) + 1)
  returning id into v_id;
  if p_token is not null then
    insert into queue_owners (entry_id, device_hash) values (v_id, q_hash(p_token));
  end if;
  perform q_log(p_machine, 'join', v_name);
  return v_id;
end;
$$;

-- "Passar a vez": quem está jogando (primeiro da fila) vai para o fim; ausentes são pulados.
create or replace function public.queue_pass(p_machine bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_first queue_entries;
  v_last  timestamptz;
begin
  select max(at) into v_last from queue_events where machine_id = p_machine and kind = 'pass';
  if v_last is not null and now() - v_last < interval '20 seconds' then
    raise exception 'a vez acabou de ser passada';
  end if;
  select * into v_first from queue_entries
   where machine_id = p_machine and status = 'waiting' order by pos limit 1 for update;
  if v_first.id is null then return; end if;
  update queue_entries
     set pos = (select max(pos) from queue_entries where machine_id = p_machine) + 1,
         turns = turns + 1
   where id = v_first.id;
  perform q_log(p_machine, 'pass', v_first.display_name);
end;
$$;

create or replace function public.queue_set_away(p_entry bigint, p_away boolean, p_token text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v queue_entries;
begin
  select * into v from queue_entries where id = p_entry;
  if v.id is null then return; end if;
  if not q_can_edit(v, p_token) then raise exception 'esta vaga não é sua'; end if;
  update queue_entries
     set status = case when p_away then 'away' else 'waiting' end,
         away_since = case when p_away then now() end
   where id = p_entry;
  perform q_log(v.machine_id, case when p_away then 'away' else 'back' end, v.display_name);
end;
$$;

create or replace function public.queue_leave(p_entry bigint, p_token text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v queue_entries;
begin
  select * into v from queue_entries where id = p_entry;
  if v.id is null then return; end if;
  if not q_can_edit(v, p_token) then raise exception 'esta vaga não é sua'; end if;
  delete from queue_entries where id = p_entry;
  perform q_log(v.machine_id, case when q_is_admin(v.machine_id) and not (auth.uid() is not null and v.user_id = auth.uid()) then 'remove' else 'leave' end, v.display_name);
end;
$$;

-- admin: mover para o topo / zerar
create or replace function public.queue_to_front(p_entry bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v queue_entries;
begin
  select * into v from queue_entries where id = p_entry;
  if v.id is null or not q_is_admin(v.machine_id) then raise exception 'só o administrador do local'; end if;
  update queue_entries set pos = (select min(pos) from queue_entries where machine_id = v.machine_id) - 1 where id = p_entry;
end;
$$;

create or replace function public.queue_reset(p_machine bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not q_is_admin(p_machine) then raise exception 'só o administrador do local'; end if;
  delete from queue_entries where machine_id = p_machine;
  perform q_log(p_machine, 'reset', null);
end;
$$;

-- regras automáticas: ausente há 1 h sai; fila parada há 2 h é zerada
create or replace function public.queue_housekeeping()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  for r in delete from queue_entries where status = 'away' and away_since < now() - interval '1 hour'
           returning machine_id, display_name loop
    perform q_log(r.machine_id, 'expire', r.display_name);
  end loop;
  for r in select m.id from machines m
            where exists (select 1 from queue_entries e where e.machine_id = m.id)
              and coalesce((select max(at) from queue_events ev where ev.machine_id = m.id), 'epoch') < now() - interval '2 hours' loop
    delete from queue_entries where machine_id = r.id;
    perform q_log(r.id, 'reset', 'inatividade');
  end loop;
end;
$$;

-- dados de um local (máquinas + fila + tempo médio por vez)
create or replace function public.venue_data(p_slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'venue', to_jsonb(v) - 'created_by',
    'is_admin', exists (select 1 from venue_admins a where a.venue_id = v.id and a.user_id = auth.uid()),
    'machines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name,
        'avg_turn_sec', coalesce((
          select extract(epoch from avg(d)) from (
            select at - lag(at) over (order by at) d from queue_events
             where machine_id = m.id and kind = 'pass' and at > now() - interval '14 days') x
           where d < interval '20 minutes'), 240),
        'last_event', (select max(at) from queue_events where machine_id = m.id)
      ) order by m.sort, m.id)
      from machines m where m.venue_id = v.id and m.active), '[]'::jsonb)
  )
  from venues v where v.slug = p_slug
$$;

-- concessões
revoke all on function public.q_hash(text), public.q_is_admin(bigint), public.q_can_edit(public.queue_entries, text),
  public.q_log(bigint, text, text), public.queue_housekeeping() from public, anon, authenticated;
grant execute on function public.queue_join(bigint, text, text), public.queue_pass(bigint),
  public.queue_set_away(bigint, boolean, text), public.queue_leave(bigint, text), public.venue_data(text) to anon, authenticated;
grant execute on function public.queue_to_front(bigint), public.queue_reset(bigint) to authenticated;

-- tarefa periódica das regras automáticas
create extension if not exists pg_cron;
select cron.schedule('stepclub-queue-housekeeping', '*/5 * * * *', $$select public.queue_housekeeping()$$);

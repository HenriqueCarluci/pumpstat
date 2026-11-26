-- Check-in por geolocalização: para entrar na fila (ou voltar de "ausente") é preciso estar perto do fliperama.
alter table public.venues
  add column address   text,
  add column latitude  double precision,
  add column longitude double precision,
  add column radius_m  int not null default 250,
  add column require_checkin boolean not null default true,
  add column sort      int not null default 0,
  add column source    text;

-- distância em metros (haversine)
create or replace function public.geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- valida o check-in; devolve a distância (ou null quando o local não exige)
create or replace function public.q_check_location(p_machine bigint, p_lat double precision, p_lng double precision, p_acc double precision)
returns double precision
language plpgsql stable security definer set search_path = public
as $$
declare v venues; d double precision;
begin
  select v2.* into v from venues v2 join machines m on m.venue_id = v2.id where m.id = p_machine;
  if v.id is null or not v.require_checkin or v.latitude is null or q_is_admin(p_machine) then return null; end if;
  if p_lat is null or p_lng is null then
    raise exception 'Ative a localização para fazer check-in em %.', v.name using errcode = 'P0001';
  end if;
  d := geo_distance_m(v.latitude, v.longitude, p_lat, p_lng);
  if d > v.radius_m + least(coalesce(p_acc, 0), 150) then
    raise exception 'Você está a % m de %. Chegue mais perto (até % m) para entrar na fila.',
      round(d)::int, v.name, v.radius_m using errcode = 'P0001';
  end if;
  return d;
end;
$$;
revoke all on function public.q_check_location(bigint, double precision, double precision, double precision) from public, anon, authenticated;

-- entrada com check-in
create or replace function public.queue_checkin(p_machine bigint, p_name text, p_token text,
  p_lat double precision, p_lng double precision, p_acc double precision)
returns bigint
language plpgsql security definer set search_path = public
as $$
begin
  perform q_check_location(p_machine, p_lat, p_lng, p_acc);
  return queue_join_core(p_machine, p_name, p_token);
end;
$$;

-- núcleo da entrada (o antigo queue_join), sem expor publicamente
create or replace function public.queue_join_core(p_machine bigint, p_name text, p_token text)
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
revoke all on function public.queue_join_core(bigint, text, text) from public, anon, authenticated;

-- o antigo queue_join continua existindo, mas exige check-in quando o local pede
create or replace function public.queue_join(p_machine bigint, p_name text default null, p_token text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
begin
  perform q_check_location(p_machine, null, null, null);
  return queue_join_core(p_machine, p_name, p_token);
end;
$$;

-- voltar de "ausente" também exige check-in
create or replace function public.queue_back(p_entry bigint, p_token text,
  p_lat double precision, p_lng double precision, p_acc double precision)
returns void
language plpgsql security definer set search_path = public
as $$
declare v queue_entries;
begin
  select * into v from queue_entries where id = p_entry;
  if v.id is null then return; end if;
  if not q_can_edit(v, p_token) then raise exception 'esta vaga não é sua'; end if;
  perform q_check_location(v.machine_id, p_lat, p_lng, p_acc);
  update queue_entries set status = 'waiting', away_since = null where id = p_entry;
  perform q_log(v.machine_id, 'back', v.display_name);
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
  if not p_away then
    perform q_check_location(v.machine_id, null, null, null);  -- local com check-in: use queue_back
  end if;
  update queue_entries
     set status = case when p_away then 'away' else 'waiting' end,
         away_since = case when p_away then now() end
   where id = p_entry;
  perform q_log(v.machine_id, case when p_away then 'away' else 'back' end, v.display_name);
end;
$$;

grant execute on function public.queue_checkin(bigint, text, text, double precision, double precision, double precision),
  public.queue_back(bigint, text, double precision, double precision, double precision) to anon, authenticated;

-- venue_data devolve também endereço e regra de check-in
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

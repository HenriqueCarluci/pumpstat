-- Fila: quem está no app pode colocar um convidado (alguém sem celular naquele momento) na fila.
-- O convidado fica "de" quem o adicionou: essa pessoa pode marcar ausente, voltar e tirar da fila por ele.
alter table public.queue_entries add column if not exists guest_of uuid references auth.users (id) on delete set null;
alter table public.queue_entries add column if not exists guest_label text; -- nome de quem adicionou, para mostrar "convidado de …"
alter table public.queue_entries add column if not exists is_guest boolean not null default false;

create or replace function public.q_can_edit(p_entry queue_entries, p_token text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select (auth.uid() is not null and (p_entry.user_id = auth.uid() or p_entry.guest_of = auth.uid()))
      or (p_token is not null and exists (select 1 from queue_owners o where o.entry_id = p_entry.id and o.device_hash = q_hash(p_token)))
      or q_is_admin(p_entry.machine_id)
$$;

create or replace function public.queue_add_guest(p_machine bigint, p_name text, p_token text,
  p_lat double precision default null, p_lng double precision default null, p_acc double precision default null)
 returns bigint language plpgsql security definer set search_path to 'public'
as $$
declare v_name text; v_by text; v_id bigint; v_hash text := case when coalesce(p_token, '') <> '' then q_hash(p_token) end;
begin
  if auth.uid() is null and v_hash is null then raise exception 'aparelho sem identificação'; end if;
  if not exists (select 1 from machines where id = p_machine and active) then raise exception 'máquina não encontrada'; end if;
  v_name := left(trim(coalesce(p_name, '')), 24);
  if v_name = '' then raise exception 'Digite o nome do convidado.'; end if;
  perform q_check_location(p_machine, p_lat, p_lng, p_acc);
  if (select count(*) from queue_entries e
       where e.machine_id = p_machine
         and e.is_guest
         and ((auth.uid() is not null and e.guest_of = auth.uid())
           or (v_hash is not null and exists (select 1 from queue_owners o where o.entry_id = e.id and o.device_hash = v_hash)))) >= 2 then
    raise exception 'Você já tem 2 convidados nesta fila.';
  end if;
  if auth.uid() is not null then
    select coalesce(nullif(split_part(nickname, ' #', 1), ''), null) into v_by
      from user_profiles where user_id = auth.uid() order by taken_at desc limit 1;
  end if;
  v_by := coalesce(v_by, (select display_name from queue_entries e where e.machine_id = p_machine
                           and not e.is_guest and ((auth.uid() is not null and e.user_id = auth.uid())
                             or (v_hash is not null and exists (select 1 from queue_owners o where o.entry_id = e.id and o.device_hash = v_hash)))
                           limit 1));
  insert into queue_entries (machine_id, user_id, display_name, pos, guest_of, guest_label, is_guest)
  values (p_machine, null, v_name, coalesce((select max(pos) from queue_entries where machine_id = p_machine), 0) + 1,
          auth.uid(), v_by, true)
  returning id into v_id;
  if v_hash is not null then insert into queue_owners (entry_id, device_hash) values (v_id, v_hash); end if;
  perform q_log(p_machine, 'join', v_name);
  return v_id;
end $$;
grant execute on function public.queue_add_guest(bigint, text, text, double precision, double precision, double precision) to anon, authenticated;

-- a vaga própria não confunde com um convidado do mesmo aparelho
create or replace function public.queue_join_core(p_machine bigint, p_name text, p_token text)
 returns bigint language plpgsql security definer set search_path to 'public'
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
   where machine_id = p_machine and not is_guest
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

-- Pedido de exclusão de fliperama: o membro pede, o admin aprova e o fliperama sai da lista
-- (fica inativo, não é apagado; o admin pode reativar).
alter table public.venues add column if not exists active boolean not null default true;

alter table public.venue_requests add column if not exists kind text not null default 'add';
alter table public.venue_requests drop constraint if exists venue_requests_kind_check;
alter table public.venue_requests add constraint venue_requests_kind_check check (kind in ('add', 'remove'));
alter table public.venue_requests add column if not exists target_venue bigint references public.venues (id) on delete cascade;

create or replace function public.request_venue_removal(p_slug text, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v venues; v_id bigint;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select * into v from venues where slug = p_slug and active;
  if not found then raise exception 'fliperama não encontrado'; end if;
  if length(coalesce(trim(p_reason), '')) < 5 then raise exception 'Conte o motivo (por exemplo: fechou, a máquina saiu).'; end if;
  if exists (select 1 from venue_requests where target_venue = v.id and kind = 'remove' and status = 'pending') then
    raise exception 'Já existe um pedido de exclusão deste fliperama esperando o admin.';
  end if;
  if (select count(*) from venue_requests where user_id = me and status = 'pending') >= 3 then
    raise exception 'Você já tem 3 pedidos esperando aprovação.';
  end if;
  insert into venue_requests (user_id, kind, target_venue, name, city, address, latitude, longitude, note)
  values (me, 'remove', v.id, v.name, v.city, v.address, v.latitude, v.longitude, left(trim(p_reason), 500))
  returning id into v_id;
  perform notify_admins('admin_venue_removal', me, v_id::text, jsonb_build_object('name', v.name, 'city', v.city, 'reason', left(trim(p_reason), 140)));
  return v_id;
end $$;
revoke all on function public.request_venue_removal(text, text) from public, anon;
grant execute on function public.request_venue_removal(text, text) to authenticated;

create or replace function public.my_venue_requests()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'name', r.name, 'city', r.city, 'status', r.status,
           'admin_note', r.admin_note, 'created_at', r.created_at, 'venue', v.slug) order by r.created_at desc), '[]'::jsonb)
    from venue_requests r left join venues v on v.id = coalesce(r.venue_id, r.target_venue) and v.active
   where r.user_id = auth.uid()
$$;

create or replace function public.admin_venue_requests(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('nickname', pr.nickname, 'target_slug', tv.slug,
            'queue_entries', (select count(*) from queue_entries e join machines m on m.id = e.machine_id where m.venue_id = r.target_venue))
           order by r.created_at desc)
    from venue_requests r
    left join venues tv on tv.id = r.target_venue
    left join lateral (select nickname from user_profiles p where p.user_id = r.user_id order by taken_at desc limit 1) pr on true
   where p_status is null or r.status = p_status), '[]'::jsonb);
end $$;

-- pedidos de exclusão: aprovar tira da lista (inativa); recusar mantém
create or replace function public.admin_review_venue_removal(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r venue_requests;
begin
  perform admin_guard();
  select * into r from venue_requests where id = p_id and kind = 'remove' for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if r.status <> 'pending' then raise exception 'este pedido já foi analisado'; end if;
  if p_approve then
    update venues set active = false where id = r.target_venue;
    delete from queue_entries where machine_id in (select id from machines where venue_id = r.target_venue);
  end if;
  update venue_requests set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = nullif(trim(p_note), ''), reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  perform notify(r.user_id, case when p_approve then 'venue_removed' else 'venue_removal_rejected' end, auth.uid(), p_id::text,
                 jsonb_build_object('name', r.name, 'note', nullif(trim(p_note), '')));
end $$;
revoke all on function public.admin_review_venue_removal(bigint, boolean, text) from public, anon;
grant execute on function public.admin_review_venue_removal(bigint, boolean, text) to authenticated;

-- admin: fliperamas fora da lista, para reativar
create or replace function public.admin_inactive_venues()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name, 'city', city) order by name)
                     from venues where not active), '[]'::jsonb);
end $$;
revoke all on function public.admin_inactive_venues() from public, anon;
grant execute on function public.admin_inactive_venues() to authenticated;

create or replace function public.admin_set_venue_active(p_venue bigint, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update venues set active = p_active where id = p_venue;
end $$;
revoke all on function public.admin_set_venue_active(bigint, boolean) from public, anon;
grant execute on function public.admin_set_venue_active(bigint, boolean) to authenticated;

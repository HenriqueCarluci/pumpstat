-- 082: Novidades: data estimada dos próximos lançamentos (dia exato ou só o mês).
alter table public.release_notes add column if not exists eta date;
alter table public.release_notes add column if not exists eta_precision text not null default 'month' check (eta_precision in ('day', 'month'));

create or replace function public.release_notes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(n) - 'published' - 'created_at' - 'updated_at'
           order by (n.status = 'soon'), n.released_on desc nulls last, n.eta nulls last, n.sort, n.id desc), '[]'::jsonb)
    from release_notes n
   where n.published
$$;

create or replace function public.admin_release_notes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('config');
  return coalesce((select jsonb_agg(to_jsonb(n) order by (n.status = 'soon'), n.released_on desc nulls last, n.eta nulls last, n.sort, n.id desc)
                     from release_notes n), '[]'::jsonb);
end $$;

create or replace function public.admin_save_release_note(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r release_notes;
  v_title jsonb := (select coalesce(jsonb_object_agg(k, left(btrim(v), 120)), '{}'::jsonb)
                      from jsonb_each_text(coalesce(p->'title', '{}'::jsonb)) e(k, v)
                     where k in ('pt','en','es','ko','ja','fr','it') and btrim(v) <> '');
  v_body jsonb := (select coalesce(jsonb_object_agg(k, left(btrim(v), 1500)), '{}'::jsonb)
                     from jsonb_each_text(coalesce(p->'body', '{}'::jsonb)) e(k, v)
                    where k in ('pt','en','es','ko','ja','fr','it') and btrim(v) <> '');
  v_status text := coalesce(p->>'status', 'released');
  v_eta date := case when v_status = 'soon' then nullif(p->>'eta', '')::date end;
  v_prec text := coalesce(nullif(p->>'eta_precision', ''), 'month');
begin
  perform admin_guard('config');
  if not v_title ? 'pt' then raise exception 'escreva o título em português'; end if;
  if v_status not in ('released', 'soon') then raise exception 'situação inválida'; end if;
  if coalesce(p->>'tag', 'new') not in ('new', 'improved', 'fixed') then raise exception 'tipo inválido'; end if;
  if v_prec not in ('day', 'month') then raise exception 'situação inválida'; end if;
  if nullif(p->>'id', '') is null then
    insert into release_notes (status, released_on, tag, title, body, published, sort, eta, eta_precision)
    values (v_status,
            case when v_status = 'released' then coalesce(nullif(p->>'released_on', '')::date, current_date) end,
            coalesce(p->>'tag', 'new'), v_title, v_body, coalesce((p->>'published')::boolean, true), coalesce((p->>'sort')::int, 0), v_eta, v_prec)
    returning * into r;
  else
    update release_notes set
      status = v_status,
      released_on = case when v_status = 'released' then coalesce(nullif(p->>'released_on', '')::date, released_on, current_date) end,
      tag = coalesce(p->>'tag', tag), title = v_title, body = v_body, eta = v_eta, eta_precision = v_prec,
      published = coalesce((p->>'published')::boolean, published), sort = coalesce((p->>'sort')::int, sort), updated_at = now()
     where id = (p->>'id')::bigint returning * into r;
    if not found then raise exception 'novidade não encontrada'; end if;
  end if;
  return to_jsonb(r);
end $$;

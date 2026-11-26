-- Casamento de títulos mais tolerante (site oficial × catálogo do PIU Scores):
-- 1) título exato; 2) título normalizado; 3) última linha (títulos com nome original + romanizado);
-- 4) o título do catálogo é prefixo do título do site (ex.: "CROSS RAY (feat. 月下Lia)" → "Cross Ray"), se único.
create or replace function public.find_song(p_title text)
returns bigint
language plpgsql stable
set search_path = public
as $$
declare
  v_id   bigint;
  v_key  text := title_key(p_title);
  v_last text := title_key(regexp_replace(p_title, '^.*\n', ''));
begin
  select id into v_id from songs where title = p_title;
  if v_id is not null then return v_id; end if;
  select id into v_id from songs where title_key = v_key order by id limit 1;
  if v_id is not null then return v_id; end if;
  if v_last <> v_key and v_last <> '' then
    select id into v_id from songs where title_key = v_last order by id limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  if length(v_key) >= 5 then
    select id into v_id from songs
     where length(title_key) >= 5 and v_key like title_key || '%'
     order by length(title_key) desc limit 1;
    if v_id is not null and (select count(*) from songs where length(title_key) >= 5 and v_key like title_key || '%') = 1 then
      return v_id;
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.jackets_apply(p_key text, p_items jsonb, p_only_missing boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         jsonb;
  v_id      bigint;
  v_updated int := 0;
  v_missing jsonb := '[]'::jsonb;
  v_rows    int;
begin
  if p_key is null or p_key <> (select value from app_secrets where name = 'ingest_key') then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  for r in select * from jsonb_array_elements(p_items) loop
    v_id := find_song(r->>0);
    if v_id is null then
      v_missing := v_missing || to_jsonb(r->>0);
      continue;
    end if;
    update songs set jacket_url = r->>1
     where id = v_id and jacket_url is distinct from r->>1
       and (not p_only_missing or jacket_url is null);
    get diagnostics v_rows = row_count;
    v_updated := v_updated + v_rows;
  end loop;
  return jsonb_build_object('ok', true, 'updated', v_updated, 'not_found', v_missing,
    'without_jacket', (select count(*) from songs where jacket_url is null));
end;
$$;
revoke all on function public.jackets_apply(text, jsonb, boolean) from public;

-- capas oficiais (sobrescrevem)
create or replace function public.set_jackets(p_key text, p_items jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select jackets_apply(p_key, p_items, false) $$;
-- capas de reserva (PIU Scores): só onde não há capa
create or replace function public.fill_jackets(p_key text, p_items jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select jackets_apply(p_key, p_items, true) $$;

revoke all on function public.set_jackets(text, jsonb) from public;
revoke all on function public.fill_jackets(text, jsonb) from public;
grant execute on function public.set_jackets(text, jsonb) to anon, authenticated;
grant execute on function public.fill_jackets(text, jsonb) to anon, authenticated;

-- find_song(): também aceita o título do catálogo como sufixo (nome original + romanizado),
-- considerando só músicas que vieram do catálogo.
create or replace function public.from_catalog_song(p_song_id bigint)
returns boolean
language sql stable set search_path = public
as $$ select exists (select 1 from charts where song_id = p_song_id and from_catalog) $$;

create or replace function public.find_song(p_title text)
returns bigint
language plpgsql stable
set search_path = public
as $$
declare
  v_id   bigint;
  v_key  text := title_key(p_title);
  v_last text := title_key(regexp_replace(p_title, '^.*\n', ''));
  v_n    int;
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
    select count(*), min(id) into v_n, v_id from songs
     where length(title_key) >= 5 and (v_key like title_key || '%' or v_key like '%' || title_key)
       and from_catalog_song(id);
    if v_n = 1 then return v_id; end if;
  end if;
  return null;
end;
$$;

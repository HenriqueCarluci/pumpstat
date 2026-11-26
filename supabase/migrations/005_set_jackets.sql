-- Capas das músicas (imagens oficiais do piugame.com), enviadas pelo coletor no modo "capas".
-- p_items: [[titulo, url], ...]
create or replace function public.set_jackets(p_key text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         jsonb;
  v_updated int := 0;
  v_missing jsonb := '[]'::jsonb;
  v_rows    int;
begin
  if p_key is null or p_key <> (select value from app_secrets where name = 'ingest_key') then
    raise exception 'chave inválida' using errcode = '28000';
  end if;
  for r in select * from jsonb_array_elements(p_items) loop
    update songs set jacket_url = r->>1
     where (title = r->>0 or title_key = title_key(r->>0))
       and jacket_url is distinct from r->>1;
    get diagnostics v_rows = row_count;
    v_updated := v_updated + v_rows;
    if not exists (select 1 from songs where title = r->>0 or title_key = title_key(r->>0)) then
      v_missing := v_missing || to_jsonb(r->>0);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'updated', v_updated, 'not_found', v_missing,
    'without_jacket', (select count(*) from songs where jacket_url is null));
end;
$$;
revoke all on function public.set_jackets(text, jsonb) from public;
grant execute on function public.set_jackets(text, jsonb) to anon, authenticated;

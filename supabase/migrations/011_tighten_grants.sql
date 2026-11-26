-- Funções internas/da conta não ficam expostas ao papel anon.
-- ingest, import_catalog, set_jackets e fill_jackets seguem abertas ao anon de propósito:
-- o coletor roda sem login no piugame.com e elas exigem a chave de sincronização.
revoke execute on function public.jackets_apply(text, jsonb, boolean) from anon, authenticated;
revoke execute on function public.claim_owner() from anon;
revoke execute on function public.my_ingest_key() from anon;

-- 045: o app passou a se chamar PIU Stats (antes StepClub).
-- Troca o nome nas mensagens das funções e nos textos guardados nas configurações.
-- O endereço, o ID do app Android e as chaves salvas no aparelho continuam com "stepclub".
do $$
declare r record;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc like '%StepClub%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'StepClub', 'PIU Stats');
  end loop;
end $$;

update public.app_settings
   set value = replace(value::text, 'StepClub', 'PIU Stats')::jsonb
 where value::text like '%StepClub%';

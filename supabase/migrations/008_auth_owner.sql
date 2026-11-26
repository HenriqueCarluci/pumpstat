-- Login (Supabase Auth): os dados pessoais passam a ser visíveis só para o dono do app.
-- O catálogo (songs, charts) continua público. O primeiro usuário logado que chamar claim_owner() vira o dono.

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
     and auth.uid()::text = (select value from app_secrets where name = 'owner_id')
$$;
grant execute on function public.is_owner() to anon, authenticated;

create or replace function public.claim_owner()
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'faça login primeiro' using errcode = '28000';
  end if;
  insert into app_secrets (name, value) values ('owner_id', auth.uid()::text)
  on conflict (name) do nothing;
  return jsonb_build_object('owner', is_owner());
end;
$$;
revoke all on function public.claim_owner() from public;
grant execute on function public.claim_owner() to authenticated;

create or replace function public.my_ingest_key()
returns text
language sql stable security definer set search_path = public
as $$
  select case when is_owner() then (select value from app_secrets where name = 'ingest_key') end
$$;
revoke all on function public.my_ingest_key() from public;
grant execute on function public.my_ingest_key() to authenticated;

alter policy "leitura publica" on public.best_scores        to authenticated using (public.is_owner());
alter policy "leitura publica" on public.best_score_history to authenticated using (public.is_owner());
alter policy "leitura publica" on public.plays              to authenticated using (public.is_owner());
alter policy "leitura publica" on public.player_snapshots   to authenticated using (public.is_owner());
alter policy "leitura publica" on public.sync_runs          to authenticated using (public.is_owner());
alter policy "leitura publica" on public.best_scores        rename to "somente o dono";
alter policy "leitura publica" on public.best_score_history rename to "somente o dono";
alter policy "leitura publica" on public.plays              rename to "somente o dono";
alter policy "leitura publica" on public.player_snapshots   rename to "somente o dono";
alter policy "leitura publica" on public.sync_runs          rename to "somente o dono";

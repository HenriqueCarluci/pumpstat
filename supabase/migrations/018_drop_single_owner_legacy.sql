-- Remove o modelo antigo de dono único (aprovado pelo Henrique em 26/11/2026; os dados já estão nas tabelas por usuário).
drop table if exists public.best_score_history;
drop table if exists public.best_scores;
drop table if exists public.plays;
drop table if exists public.player_snapshots;
drop table if exists public.sync_runs;
drop function if exists public.claim_owner();
drop function if exists public.my_ingest_key();
drop function if exists public.is_owner();
delete from public.app_secrets where name in ('owner_id', 'legacy_adopted');

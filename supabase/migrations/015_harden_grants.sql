alter function public.q_hash(text) set search_path = public, extensions;
revoke execute on function public.queue_to_front(bigint), public.queue_reset(bigint) from public, anon;
grant execute on function public.queue_to_front(bigint), public.queue_reset(bigint) to authenticated;
-- funções do modelo antigo (dono único) ficam desativadas até serem removidas
revoke execute on function public.claim_owner(), public.my_ingest_key(), public.is_owner() from public, anon, authenticated;

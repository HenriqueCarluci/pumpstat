-- Desconectar a conta da Pump (AM.PASS): a conta do PIU Stats continua (amigos, time, ajustes, treino);
-- só as notas importadas saem, para o mesmo ID da Pump poder ser conectado em outra conta sem duplicar.
create or replace function public.unlink_my_piu()
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  perform wipe_game_data(me);
  delete from user_syncs where user_id = me;
  delete from piu_sessions where user_id = me;
  update piu_accounts set game_id = null, piu_login = null, auto_sync = false, auto_sync_error = null, last_sync_at = null
   where user_id = me;
end $$;
revoke all on function public.unlink_my_piu() from public, anon;
grant execute on function public.unlink_my_piu() to authenticated;

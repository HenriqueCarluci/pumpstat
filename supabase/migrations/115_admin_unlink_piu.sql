-- 115: Admin → Usuários: desconectar a conta da Pump (AM.PASS) de alguém (ex.: conta de teste).
-- Faz o mesmo que "Desconectar conta da Pump" nos Ajustes da pessoa: apaga as notas importadas e a ligação com o AM.PASS;
-- conta, amigos, time e ajustes continuam. Exige a permissão de bloquear; outro admin só com a de papéis. Fica registrado.
create table if not exists public.admin_actions_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target uuid references auth.users(id) on delete set null,
  at timestamptz not null default now()
);
alter table public.admin_actions_log enable row level security;
revoke all on public.admin_actions_log from public, anon, authenticated;

create or replace function public.admin_unlink_piu(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('ban');
  if is_app_admin(p_user) and p_user <> auth.uid() and not has_admin_perm('roles') then
    raise exception 'só quem gerencia a equipe pode desconectar a conta de outro administrador';
  end if;
  perform wipe_game_data(p_user);
  delete from user_syncs where user_id = p_user;
  delete from piu_sessions where user_id = p_user;
  update piu_accounts set game_id = null, piu_login = null, auto_sync = false, auto_sync_error = null, last_sync_at = null
   where user_id = p_user;
  insert into admin_actions_log (admin_id, action, target) values (auth.uid(), 'unlink_piu', p_user);
end $$;
revoke all on function public.admin_unlink_piu(uuid) from public, anon;
grant execute on function public.admin_unlink_piu(uuid) to authenticated;

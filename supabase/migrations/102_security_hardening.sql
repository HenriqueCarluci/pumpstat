-- Endurecimento de segurança (revisão de 27/11/2026)

-- 1) Catálogo e capas: só a chave do servidor ou a chave de sincronização de quem é admin com a permissão "charts".
--    Antes qualquer usuário, com a chave do próprio favorito de sincronização, conseguia mexer no catálogo de todos.
create or replace function public.is_valid_key(p_key text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select p_key is not null and (
    p_key = (select value from app_secrets where name = 'ingest_key')
    or exists (select 1 from piu_accounts a where a.sync_key = p_key and has_admin_perm('charts', a.user_id)))
$$;
revoke execute on function public.is_valid_key(text) from public, anon, authenticated;

-- 2) Passar a vez: só quem está na fila desta máquina (pela conta ou pelo aparelho) ou o admin do local.
drop function if exists public.queue_pass(bigint);
create or replace function public.queue_pass(p_machine bigint, p_token text default null)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  v_first queue_entries;
  v_last  timestamptz;
begin
  if not q_is_admin(p_machine) and not exists (
    select 1 from queue_entries e
     where e.machine_id = p_machine and e.status in ('waiting', 'away') and q_can_edit(e, p_token)) then
    raise exception 'só quem está na fila desta máquina pode passar a vez';
  end if;
  select max(at) into v_last from queue_events where machine_id = p_machine and kind = 'pass';
  if v_last is not null and now() - v_last < interval '20 seconds' then
    raise exception 'a vez acabou de ser passada';
  end if;
  select * into v_first from queue_entries
   where machine_id = p_machine and status = 'waiting' order by pos limit 1 for update;
  if v_first.id is null then return; end if;
  update queue_entries
     set pos = (select max(pos) from queue_entries where machine_id = p_machine) + 1,
         turns = turns + 1
   where id = v_first.id;
  perform q_log(p_machine, 'pass', v_first.display_name);
end;
$$;
grant execute on function public.queue_pass(bigint, text) to anon, authenticated;

-- 3) Funções auxiliares que revelavam quem é admin, quem é amigo de quem e quem bloqueou quem:
--    ficam só para uso interno (as funções do app continuam chamando normalmente).
drop policy if exists "dono ou publico" on public.user_titles;
create policy "dono ou amigos" on public.user_titles for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from friendships f where f.status = 'accepted'
       and ((f.requester = auth.uid() and f.addressee = user_titles.user_id)
         or (f.addressee = auth.uid() and f.requester = user_titles.user_id))));
revoke execute on function public.admin_role(uuid) from public, anon, authenticated;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.has_admin_perm(text, uuid) from public, anon, authenticated;
revoke execute on function public.is_app_admin(uuid) from public, anon, authenticated;

-- 4) Arrumação: caminho de busca fixo nas funções que não tinham
alter function public.slugify(text) set search_path = public;
alter function public.grade_rank(text) set search_path = public;
alter function public.admin_perms(text) set search_path = public;
alter function public.mission_week_ok(date) set search_path = public;
alter function public.norm_game_id(text) set search_path = public;

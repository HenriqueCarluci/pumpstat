-- Aviso de versão nova do app Android para quem está na lista de testes (notificação no app).
create or replace function public.admin_notify_android_testers(p_version text)
 returns int language plpgsql security definer set search_path to 'public'
as $$
declare n int;
begin
  perform admin_guard('users');
  if coalesce(trim(p_version), '') = '' or length(p_version) > 20 then raise exception 'Informe a versão (ex.: 1.0.105).'; end if;
  insert into notifications (user_id, kind, ref, payload)
  select t.user_id, 'app_update', 'android:' || trim(p_version),
         jsonb_build_object('version', trim(p_version), 'link', 'https://play.google.com/store/apps/details?id=com.henriquecarluci.stepclub')
    from android_testers t
   where t.added
     and not exists (select 1 from notifications x where x.user_id = t.user_id and x.kind = 'app_update' and x.ref = 'android:' || trim(p_version));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.admin_notify_android_testers(text) from public, anon;
grant execute on function public.admin_notify_android_testers(text) to authenticated;

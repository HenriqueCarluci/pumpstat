-- 127: quando o e-mail do testador entrou de fato na lista do Play Console. Quem o admin inclui (added) e ainda
-- não tem play_at é colocado na Play por uma tarefa de hora em hora (pelo Chrome do admin), que preenche play_at.
alter table public.android_testers add column if not exists play_at timestamptz;
update public.android_testers set play_at = now() where added and play_at is null;

create or replace function public.admin_android_testers()
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  perform admin_guard('users');
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'email', t.email, 'added', t.added, 'notify', t.notify,
      'by_admin', t.by_admin, 'at', t.created_at, 'play_at', t.play_at,
      'nick', coalesce((select pr.nickname from user_profiles pr where pr.user_id = t.user_id and pr.nickname is not null limit 1), account_label(t.user_id)))
      order by t.added, t.created_at desc)
    from android_testers t), '[]'::jsonb);
end $$;

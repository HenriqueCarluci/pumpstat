-- Sessão do piugame guardada CRIPTOGRAFADA (chave só no servidor) para o botão "Sincronizar agora". Nunca guarda senha.
create table public.piu_sessions (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  blob     text not null,
  saved_at timestamptz not null default now()
);
alter table public.piu_sessions enable row level security;

create or replace function public.save_piu_session(p_blob text)
returns void language sql security definer set search_path = public as $$
  insert into piu_sessions (user_id, blob) values (auth.uid(), p_blob)
  on conflict (user_id) do update set blob = excluded.blob, saved_at = now()
$$;
create or replace function public.my_piu_session()
returns text language sql stable security definer set search_path = public as $$
  select blob from piu_sessions where user_id = auth.uid()
$$;
create or replace function public.forget_piu_session()
returns void language sql security definer set search_path = public as $$
  delete from piu_sessions where user_id = auth.uid()
$$;
create or replace function public.has_piu_session()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('saved', exists (select 1 from piu_sessions where user_id = auth.uid()),
                            'saved_at', (select saved_at from piu_sessions where user_id = auth.uid()))
$$;
revoke all on function public.save_piu_session(text), public.my_piu_session(), public.forget_piu_session(), public.has_piu_session() from public, anon;
grant execute on function public.save_piu_session(text), public.my_piu_session(), public.forget_piu_session(), public.has_piu_session() to authenticated;

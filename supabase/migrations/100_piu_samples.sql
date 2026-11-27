-- Trechos de HTML do piugame guardados pelo servidor para ajustar a leitura (ex.: janela "Switch Account").
-- Só o admin lê; o servidor grava com a chave dele. Guarda no máximo 30 por tipo.
create table if not exists public.piu_samples (
  id bigint generated always as identity primary key,
  kind text not null,
  info jsonb not null default '{}'::jsonb,
  html text not null,
  created_at timestamptz not null default now()
);
alter table public.piu_samples enable row level security;

create or replace function public.save_piu_sample(p_key text, p_kind text, p_info jsonb, p_html text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  insert into piu_samples (kind, info, html) values (left(p_kind, 40), coalesce(p_info, '{}'::jsonb), left(p_html, 60000));
  delete from piu_samples where kind = p_kind and id not in (select id from piu_samples where kind = p_kind order by id desc limit 30);
end $$;
revoke all on function public.save_piu_sample(text, text, jsonb, text) from public;
grant execute on function public.save_piu_sample(text, text, jsonb, text) to anon, authenticated;

-- 090: Questionário do jogador (experiência, frequência, objetivo, modo e o que quer melhorar).
-- Pedido no primeiro acesso (dá para pular) e refeito em Ajustes. Calibra missões e recomendações.
alter table public.user_settings add column if not exists quiz jsonb;
alter table public.user_settings add column if not exists quiz_at timestamptz;
alter table public.user_settings add column if not exists quiz_skipped_at timestamptz;

create or replace function public.my_quiz()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('quiz', s.quiz, 'at', s.quiz_at, 'skipped_at', s.quiz_skipped_at)
    from (select auth.uid() as me) x left join user_settings s on s.user_id = x.me
   where auth.uid() is not null
$$;
revoke all on function public.my_quiz() from public, anon;
grant execute on function public.my_quiz() to authenticated;

create or replace function public.save_quiz(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 2000 then raise exception 'respostas inválidas'; end if;
  v := jsonb_strip_nulls(jsonb_build_object(
    'exp', case when p->>'exp' in ('new', 'lt1', 'y1_3', 'gt3') then p->>'exp' end,
    'freq', case when p->>'freq' in ('rare', 'weekly', 'few', 'daily') then p->>'freq' end,
    'goal', case when p->>'goal' in ('fun', 'level', 'score', 'pumbility', 'compete') then p->>'goal' end,
    'mode', case when p->>'mode' in ('S', 'D', 'both') then p->>'mode' end,
    'skills', (select jsonb_agg(x) from (select distinct x from jsonb_array_elements_text(coalesce(p->'skills', '[]'::jsonb)) x
                where x ~ '^[a-z_]{2,20}$' limit 3) s)));
  insert into user_settings (user_id, quiz, quiz_at) values (auth.uid(), v, now())
  on conflict (user_id) do update set quiz = excluded.quiz, quiz_at = now();
end $$;
revoke all on function public.save_quiz(jsonb) from public, anon;
grant execute on function public.save_quiz(jsonb) to authenticated;

create or replace function public.skip_quiz()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  insert into user_settings (user_id, quiz_skipped_at) values (auth.uid(), now())
  on conflict (user_id) do update set quiz_skipped_at = now();
end $$;
revoke all on function public.skip_quiz() from public, anon;
grant execute on function public.skip_quiz() to authenticated;

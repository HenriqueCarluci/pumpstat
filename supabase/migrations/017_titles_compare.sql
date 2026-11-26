-- Títulos do jogador, perfil público e comparação entre jogadores do StepClub.

alter table public.piu_accounts add column is_public boolean not null default true;

create table public.user_titles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  version    text not null,
  name       text not null,
  owned      boolean not null,
  color      int,                 -- classe colN do site (0 = comum … 8 = preto)
  condition  text,
  cur        numeric,
  target     numeric,
  ord        int not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, version, name)
);
alter table public.user_titles enable row level security;
create policy "dono ou publico" on public.user_titles for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from piu_accounts p where p.user_id = user_titles.user_id and p.is_public));


-- grava a lista de títulos da sincronização (substitui a anterior daquela versão)
create or replace function public.ingest_titles_me(p_version text, p_titles jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_version not in ('phoenix', 'phoenix2') then raise exception 'versão inválida'; end if;
  delete from user_titles where user_id = auth.uid() and version = p_version;
  insert into user_titles (user_id, version, name, owned, color, condition, cur, target, ord)
  select auth.uid(), p_version, t->>'name', coalesce((t->>'owned')::boolean, false), nullif(t->>'color', '')::int,
         nullif(t->>'condition', ''), nullif(t->>'cur', '')::numeric, nullif(t->>'target', '')::numeric, ord::int
    from jsonb_array_elements(p_titles) with ordinality as x(t, ord)
   where coalesce(t->>'name', '') <> ''
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.ingest_titles_me(text, jsonb) from public, anon;
grant execute on function public.ingest_titles_me(text, jsonb) to authenticated;

create or replace function public.my_titles(p_version text, p_user uuid default null)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(name, owned, color, condition, cur, target) order by ord), '[]'::jsonb)
    from user_titles where user_id = coalesce(p_user, auth.uid()) and version = p_version
$$;
grant execute on function public.my_titles(text, uuid) to authenticated;

create or replace function public.set_public(p_public boolean)
returns void
language sql security definer set search_path = public
as $$
  insert into piu_accounts (user_id, is_public) values (auth.uid(), p_public)
  on conflict (user_id) do update set is_public = excluded.is_public
$$;
revoke all on function public.set_public(boolean) from public, anon;
grant execute on function public.set_public(boolean) to authenticated;

-- jogadores visíveis (público + eu), com PUMBILITY e título atuais
create or replace function public.players(p_version text default 'phoenix2')
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.user_id, 'me', a.user_id = auth.uid(), 'public', a.is_public,
           'nickname', pr.nickname, 'title', pr.title, 'avatar', pr.avatar_url, 'pumbility', pr.pumbility,
           'bests', (select count(*) from user_scores s join charts c on c.id = s.chart_id where s.user_id = a.user_id and c.version = p_version),
           'last_sync', a.last_sync_at)
         order by pr.pumbility desc nulls last), '[]'::jsonb)
    from piu_accounts a
    join lateral (select * from user_profiles p where p.user_id = a.user_id and p.version = p_version order by taken_at desc limit 1) pr on true
   where auth.uid() is not null and (a.is_public or a.user_id = auth.uid())
$$;
revoke all on function public.players(text) from public, anon;
grant execute on function public.players(text) to authenticated;

-- comparação chart a chart entre mim e outro jogador público
create or replace function public.compare_player(p_other uuid, p_version text default 'phoenix2')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_other <> auth.uid() and not exists (select 1 from piu_accounts where user_id = p_other and is_public) then
    raise exception 'este jogador não compartilha os dados';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_array(c.id, m.score, m.grade, m.plate, m.broken, o.score, o.grade, o.plate, o.broken)), '[]'::jsonb)
      from charts c
      left join user_scores m on m.chart_id = c.id and m.user_id = auth.uid()
      left join user_scores o on o.chart_id = c.id and o.user_id = p_other
     where c.version = p_version and (m.score is not null or o.score is not null)
  );
end;
$$;
revoke all on function public.compare_player(uuid, text) from public, anon;
grant execute on function public.compare_player(uuid, text) to authenticated;

-- ranking de um chart entre os jogadores do StepClub
create or replace function public.chart_ranking(p_chart_id bigint)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x order by (x->>'score')::int desc), '[]'::jsonb) from (
    select jsonb_build_object('id', s.user_id, 'me', s.user_id = auth.uid(), 'score', s.score, 'grade', s.grade,
             'plate', s.plate, 'broken', s.broken,
             'nickname', (select nickname from user_profiles p where p.user_id = s.user_id order by taken_at desc limit 1),
             'avatar', (select avatar_url from user_profiles p where p.user_id = s.user_id order by taken_at desc limit 1)) x
      from user_scores s join piu_accounts a on a.user_id = s.user_id
     where s.chart_id = p_chart_id and auth.uid() is not null and (a.is_public or s.user_id = auth.uid())
     order by s.score desc limit 20) t
$$;
revoke all on function public.chart_ranking(bigint) from public, anon;
grant execute on function public.chart_ranking(bigint) to authenticated;

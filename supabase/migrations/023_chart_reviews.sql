-- 023: avaliação da comunidade — quem passou o chart comenta, vota no tier e marca o estilo
create table if not exists public.chart_reviews (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  chart_id   bigint not null references public.charts(id) on delete cascade,
  tier       smallint check (tier between -2 and 2),          -- -2 muito fácil … +2 topo do nível
  tags       text[] not null default '{}',
  comment    text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, chart_id)
);
create index if not exists chart_reviews_chart_idx on public.chart_reviews (chart_id);
alter table public.chart_reviews enable row level security;
drop policy if exists "dono" on public.chart_reviews;
create policy "dono" on public.chart_reviews for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.chart_reviews from anon, authenticated;

create or replace function public.review_chart(p_chart bigint, p_tier smallint, p_tags text[], p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_tags text[]; v_comment text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if not exists (select 1 from user_scores s where s.user_id = me and s.chart_id = p_chart and not coalesce(s.broken, false)) then
    raise exception 'só quem já passou este chart pode avaliar (sincronize suas notas)';
  end if;
  select coalesce(array_agg(distinct t), '{}') into v_tags
    from unnest(coalesce(p_tags, '{}')) t
   where t in ('twist', 'drill', 'run', 'bracket', 'jump', 'jack', 'doublestep', 'footswitch', 'gimmick', 'stamina', 'hold', 'tecnico');
  v_comment := nullif(trim(coalesce(p_comment, '')), '');
  if p_tier is null and cardinality(v_tags) = 0 and v_comment is null then
    delete from chart_reviews where user_id = me and chart_id = p_chart;
    return jsonb_build_object('deleted', true);
  end if;
  insert into chart_reviews (user_id, chart_id, tier, tags, comment)
  values (me, p_chart, p_tier, v_tags, left(v_comment, 500))
  on conflict (user_id, chart_id) do update set tier = excluded.tier, tags = excluded.tags,
    comment = excluded.comment, updated_at = now();
  return jsonb_build_object('saved', true);
end $$;
revoke all on function public.review_chart(bigint, smallint, text[], text) from public, anon;
grant execute on function public.review_chart(bigint, smallint, text[], text) to authenticated;

-- detalhes de um chart: média, tags com contagem, minha avaliação e comentários
create or replace function public.chart_reviews_for(p_chart bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'votes', (select count(tier) from chart_reviews where chart_id = p_chart),
    'avg', (select round(avg(tier)::numeric, 2) from chart_reviews where chart_id = p_chart),
    'dist', (select jsonb_object_agg(tier, n) from (select tier, count(*) n from chart_reviews
              where chart_id = p_chart and tier is not null group by tier) d),
    'tags', (select coalesce(jsonb_agg(jsonb_build_array(t, n) order by n desc, t), '[]') from
              (select t, count(*) n from chart_reviews r, unnest(r.tags) t where r.chart_id = p_chart group by t) x),
    'can_review', exists (select 1 from user_scores s where s.user_id = auth.uid() and s.chart_id = p_chart
                           and not coalesce(s.broken, false)),
    'mine', (select jsonb_build_object('tier', tier, 'tags', tags, 'comment', comment)
               from chart_reviews where chart_id = p_chart and user_id = auth.uid()),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
                    'user', r.user_id, 'me', r.user_id = auth.uid(), 'nickname', pr.nickname, 'avatar', pr.avatar_url,
                    'tier', r.tier, 'tags', r.tags, 'comment', r.comment, 'at', r.updated_at,
                    -- a nota de quem comenta só aparece para amigos (mesma regra das notas)
                    'grade', case when are_friends(auth.uid(), r.user_id) then s.grade end,
                    'plate', case when are_friends(auth.uid(), r.user_id) then s.plate end) order by r.updated_at desc), '[]')
                   from chart_reviews r
                   left join user_scores s on s.user_id = r.user_id and s.chart_id = r.chart_id
                   left join lateral (select nickname, avatar_url from user_profiles p where p.user_id = r.user_id
                                       order by taken_at desc limit 1) pr on true
                  where r.chart_id = p_chart and r.comment is not null))
  where auth.uid() is not null
$$;
revoke all on function public.chart_reviews_for(bigint) from public, anon;
grant execute on function public.chart_reviews_for(bigint) to authenticated;

-- resumo por chart da versão (só charts com avaliação): [[chart_id, média, votos, [tags mais marcadas]]]
create or replace function public.community_charts(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.avg, x.votes, x.tags)), '[]')
    from (
      select r.chart_id, round(avg(r.tier)::numeric, 2) avg, count(r.tier) votes,
             (select coalesce(jsonb_agg(t order by n desc), '[]') from
                (select t, count(*) n from chart_reviews r2, unnest(r2.tags) t where r2.chart_id = r.chart_id
                  group by t having count(*) >= 1 order by n desc limit 3) z) tags
        from chart_reviews r join charts c on c.id = r.chart_id
       where c.version = p_version
       group by r.chart_id
    ) x
   where auth.uid() is not null
$$;
revoke all on function public.community_charts(text) from public, anon;
grant execute on function public.community_charts(text) to authenticated;

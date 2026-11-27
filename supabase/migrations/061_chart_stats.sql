-- 061: números de um chart entre os jogadores do PIU Stats (página do chart, no estilo do ArcadeStat).
-- Só agregados: quantos têm recorde, quantos passaram, notas, e jogadas registradas (passes / total).
create index if not exists user_plays_chart_idx on public.user_plays (chart_id);

create or replace function public.chart_stats(p_chart bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'players', (select count(*) from user_scores where chart_id = p_chart),
    'clears', (select count(*) from user_scores where chart_id = p_chart and not coalesce(broken, false)),
    'avg', (select round(avg(score)) from user_scores where chart_id = p_chart and not coalesce(broken, false)),
    'grades', (select coalesce(jsonb_object_agg(grade, n), '{}'::jsonb) from (
                 select grade, count(*) n from user_scores
                  where chart_id = p_chart and not coalesce(broken, false) and grade is not null group by grade) g),
    'plays', (select count(*) from user_plays where chart_id = p_chart),
    'play_passes', (select count(*) from user_plays where chart_id = p_chart and not broken)
  ) end
$$;
revoke all on function public.chart_stats(bigint) from public;
grant execute on function public.chart_stats(bigint) to authenticated;

-- Dia de jogo: separa primeiro passe de upscore.
-- 1) melhores scores sem data (achieved_at nulo) contam como anteriores ao dia;
-- 2) devolve 'coverage' (primeira foto completa dos melhores scores) para o app não chamar de primeiro passe o que ele não tem como saber.
create or replace function public.my_day_report(p_version text default 'phoenix2', p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_day date; v_start timestamptz; v_end timestamptz; v_prev date; v_res jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  v_day := coalesce(p_day, (select max(play_day(p.played_at)) from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
                             where p.user_id = me));
  if v_day is null then return jsonb_build_object('day', null, 'days', '[]'::jsonb, 'charts', '[]'::jsonb, 'plays', '[]'::jsonb); end if;
  v_start := (v_day::timestamp + interval '5 hours') at time zone 'America/Sao_Paulo';
  v_end := v_start + interval '1 day';
  select max(play_day(p.played_at)) into v_prev from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
   where p.user_id = me and p.played_at < v_start;

  with d as (
    select p.* from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
     where p.user_id = me and p.played_at >= v_start and p.played_at < v_end
  ),
  before as (
    select chart_id, score, grade, plate, broken from user_plays
     where user_id = me and played_at < v_start and chart_id in (select chart_id from d)
    union all
    select chart_id, score, grade, plate, broken from user_score_history
     where user_id = me and seen_at < v_start and chart_id in (select chart_id from d)
    union all
    -- melhor score sem data: não bateu com nenhuma jogada registrada, então é de antes do histórico de jogadas
    select chart_id, score, grade, plate, coalesce(broken, false) from user_scores
     where user_id = me and (achieved_at < v_start or achieved_at is null) and chart_id in (select chart_id from d)
  ),
  prev_best as (
    select distinct on (chart_id) chart_id, score, grade, plate from before where not broken and score is not null
     order by chart_id, score desc
  ),
  prev_tries as (
    select chart_id, count(*) as n from user_plays where user_id = me and played_at < v_start and chart_id in (select chart_id from d) group by chart_id
  ),
  agg as (
    select chart_id, count(*) as tries, count(*) filter (where not broken) as passes, max(played_at) as last_at,
           max(score) filter (where broken) as best_fail
      from d group by chart_id
  ),
  best as (
    select distinct on (chart_id) chart_id, score, grade, plate from d where not broken and score is not null
     order by chart_id, score desc, played_at
  ),
  rows as (
    select a.chart_id, a.tries, a.passes, b.score, b.grade, b.plate, pb.score as prev_score, pb.grade as prev_grade, pb.plate as prev_plate,
           coalesce(pt.n, 0) as tries_before, a.best_fail, a.last_at
      from agg a left join best b using (chart_id) left join prev_best pb using (chart_id) left join prev_tries pt using (chart_id)
  )
  select jsonb_build_object(
    'day', v_day, 'start', extract(epoch from v_start)::bigint, 'end', extract(epoch from v_end)::bigint,
    -- desde quando temos a foto completa dos melhores scores: antes disso, um passe sem registro anterior pode ser primeiro passe ou upscore
    'coverage', (select extract(epoch from min(seen_at))::bigint from user_score_history where user_id = me),
    -- [chart, tentativas, passes, score, grade, plate, score antes, grade antes, plate antes, tentativas antes, melhor score quebrado]
    'charts', coalesce((select jsonb_agg(jsonb_build_array(chart_id, tries, passes, score, grade, plate, prev_score, prev_grade, prev_plate,
                                                          tries_before, best_fail) order by last_at desc) from rows), '[]'::jsonb),
    -- [chart, epoch, score, grade, plate, quebrou, perfect, great, good, bad, miss]
    'plays', coalesce((select jsonb_agg(jsonb_build_array(chart_id, extract(epoch from played_at)::bigint, score, grade, plate, broken,
                                                         perfect, great, good, bad, miss) order by played_at) from d), '[]'::jsonb),
    'prev', (select jsonb_build_object('day', v_prev, 'plays', count(*), 'passes', count(*) filter (where not p.broken),
                                       'avg_level', round(avg(c.level) filter (where not p.broken and c.mode in ('S', 'D')), 1),
                                       'max_d', max(c.level) filter (where not p.broken and c.mode = 'D'),
                                       'max_s', max(c.level) filter (where not p.broken and c.mode = 'S'))
               from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
              where v_prev is not null and p.user_id = me and play_day(p.played_at) = v_prev),
    'days', coalesce((select jsonb_agg(jsonb_build_array(dd, n) order by dd desc) from (
               select play_day(p.played_at) as dd, count(*) as n from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
                where p.user_id = me group by 1 order by 1 desc limit 60) x), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.my_day_report(text, date) from public, anon;
grant execute on function public.my_day_report(text, date) to authenticated;

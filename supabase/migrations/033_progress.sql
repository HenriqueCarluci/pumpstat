-- Dados para a tela Progresso: evolução, pontos fracos, dicas e plano de treino.
-- history: mudanças do recorde de cada chart (user_score_history)
-- plays:   todas as jogadas registradas (passou ou quebrou, com julgamentos)
-- styles:  % de cada padrão por chart (single/double, arredondado), notas/s e se é de resistência ('sustained')
create or replace function public.my_progress(p_version text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'history', (
      select coalesce(jsonb_agg(jsonb_build_array(h.chart_id, extract(epoch from h.seen_at)::bigint, h.score, h.grade, h.plate, h.broken)
                                order by h.seen_at), '[]'::jsonb)
        from user_score_history h join charts c on c.id = h.chart_id
       where h.user_id = auth.uid() and c.version = p_version
    ),
    'firsts', (
      select coalesce(jsonb_agg(jsonb_build_array(s.chart_id, extract(epoch from s.first_seen)::bigint,
                                extract(epoch from s.achieved_at)::bigint)), '[]'::jsonb)
        from user_scores s join charts c on c.id = s.chart_id
       where s.user_id = auth.uid() and c.version = p_version
    ),
    'plays', (
      select coalesce(jsonb_agg(jsonb_build_array(p.chart_id, extract(epoch from p.played_at)::bigint, p.score, p.grade, p.broken,
                                p.perfect, p.great, p.good, p.bad, p.miss) order by p.played_at), '[]'::jsonb)
        from user_plays p join charts c on c.id = p.chart_id
       where p.user_id = auth.uid() and c.version = p_version
    ),
    'styles', (
      select coalesce(jsonb_agg(jsonb_build_array(c.id, round(st.twist)::int, round(st.drill)::int, round(st.run)::int, round(st.bracket)::int,
                                round(st.jump)::int, round(st.jack)::int, round(st.doublestep)::int, round(st.footswitch)::int,
                                round(st.nps, 1), (case when 'sustained' = any(st.tags) then 1 else 0 end))), '[]'::jsonb)
        from charts c join chart_styles st on st.song_id = c.song_id and st.mode = c.mode and st.level = c.level
       where c.version = p_version and c.mode in ('S', 'D') and c.level >= 5
    )
  )
$$;
revoke all on function public.my_progress(text) from public, anon;
grant execute on function public.my_progress(text) to authenticated;

-- Gamificação semanal: semanas jogadas (para a sequência) e o PUMBILITY seu e do rival na semana passada.
-- Semana = segunda a domingo no horário de São Paulo.
create or replace function public.my_week()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_cur date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
  v_prev date := v_cur - 7;
  v_from timestamptz := (v_prev::timestamp at time zone 'America/Sao_Paulo');
  v_to timestamptz := (v_cur::timestamp at time zone 'America/Sao_Paulo');
  v_rival uuid;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select s.rival into v_rival from user_settings s where s.user_id = me and s.rival is not null and are_friends(me, s.rival);
  return jsonb_build_object(
    'week', v_cur, 'prev', v_prev,
    'weeks', (select coalesce(jsonb_agg(w order by w desc), '[]'::jsonb) from (
               select distinct date_trunc('week', p.played_at at time zone 'America/Sao_Paulo')::date as w
                 from user_plays p where p.user_id = me and p.played_at > now() - interval '2 years') x),
    'pb', jsonb_build_object(
       'start', (select pumbility from user_profiles where user_id = me and version = 'phoenix2' and pumbility is not null and taken_at < v_from order by taken_at desc limit 1),
       'end', (select pumbility from user_profiles where user_id = me and version = 'phoenix2' and pumbility is not null and taken_at < v_to order by taken_at desc limit 1)),
    'rival', case when v_rival is null then null else (
       presence_card(me, v_rival) || jsonb_build_object(
         'start', (select pumbility from user_profiles where user_id = v_rival and version = 'phoenix2' and pumbility is not null and taken_at < v_from order by taken_at desc limit 1),
         'end', (select pumbility from user_profiles where user_id = v_rival and version = 'phoenix2' and pumbility is not null and taken_at < v_to order by taken_at desc limit 1),
         'plays', (select count(*) from user_plays p where p.user_id = v_rival and p.played_at >= v_from and p.played_at < v_to))) end);
end $$;
revoke all on function public.my_week() from public, anon;
grant execute on function public.my_week() to authenticated;

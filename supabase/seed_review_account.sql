-- Conta de revisão do Google Play: recordes de exemplo + Plus permanente.
-- Uso (uma vez, depois que a conta foi criada e confirmada pelo app):
--   troque :email abaixo pelo e-mail da conta de revisão e rode.
-- É idempotente: apaga só os dados de jogo DESSA conta e recria.
do $$
declare
  v_email text := ':email';
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then raise exception 'conta % não encontrada', v_email; end if;

  delete from user_plays where user_id = v_uid;
  delete from user_scores where user_id = v_uid;
  delete from user_profiles where user_id = v_uid;

  -- ~160 charts da Phoenix 2 (S e D, níveis 8 a 21); nota cai com o nível.
  create temp table _seed on commit drop as
  select c.id chart_id, c.level, c.mode,
         greatest(560000, least(999000,
           (1000000 - (c.level - 8) * 9000 - floor(random() * 60000))::int)) score
  from charts c
  where c.version = 'phoenix2' and c.mode in ('S', 'D') and c.level between 8 and 21
  order by random() limit 160;

  insert into user_scores (user_id, chart_id, score, grade, plate, broken, achieved_at, first_seen, updated_at)
  select v_uid, chart_id, score,
    case when score >= 995000 then 'SSS+' when score >= 990000 then 'SSS' when score >= 985000 then 'SS+'
         when score >= 980000 then 'SS' when score >= 975000 then 'S+' when score >= 970000 then 'S'
         when score >= 960000 then 'AAA+' when score >= 950000 then 'AAA' when score >= 925000 then 'AA+'
         when score >= 900000 then 'AA' when score >= 825000 then 'A+' else 'A' end,
    case when score >= 990000 then 'SG' when score >= 975000 then 'MG' when score >= 955000 then 'TG'
         when score >= 900000 then 'FG' else 'RG' end,
    level >= 21 and random() < 0.5,
    now() - (random() * interval '60 days'), now() - interval '60 days', now()
  from _seed;

  -- Jogadas nas últimas semanas (missões, sequência e resumo da semana têm o que mostrar).
  insert into user_plays (user_id, chart_id, score, grade, plate, broken, played_at)
  select v_uid, s.chart_id, s.score, s.grade, s.plate, s.broken,
         date_trunc('hour', now()) - (w * interval '7 days') - (random() * interval '4 days') - (n * interval '3 minutes')
  from user_scores s
  cross join generate_series(0, 3) w
  cross join lateral (select generate_series(1, 2) n) g
  where s.user_id = v_uid and random() < 0.15
  on conflict do nothing;

  insert into user_profiles (user_id, version, nickname, title, pumbility, best_count, taken_at)
  values (v_uid, 'phoenix2', 'REVISOR', 'Google Play', 14250, 160, now());

  insert into subscriptions (user_id, plan, source, expires_at, note)
  values (v_uid, 'plus', 'comp', null, 'Conta de revisão do Google Play')
  on conflict (user_id) do update set plan = 'plus', source = 'comp', expires_at = null,
    note = excluded.note, updated_at = now();
end $$;

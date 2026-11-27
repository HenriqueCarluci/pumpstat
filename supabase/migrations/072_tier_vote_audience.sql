-- 072: quem recebe o aviso de "votação de tier aberta" passa a ser configurável pelo admin (app_config.community):
--   tier_notify       'cleared' (padrão: quem passou o chart) | 'reviewers' (só quem avaliou, como antes) | 'off'
--   tier_notify_days  só quem sincronizou nos últimos N dias (padrão 30; 0 = sem limite)
--   tier_notify_p1    também avisa quem passou o mesmo chart (música, modo e nível) na outra versão (padrão true)
--   tier_notify_max   teto de avisos por votação (padrão 300)
-- Quem avaliou o chart continua recebendo o aviso em qualquer modo, menos 'off'.
create or replace function public.tier_vote_audience(p_chart bigint, p_me uuid)
returns table (uid uuid) language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb := coalesce(app_config()->'community', '{}'::jsonb);
  v_mode text := coalesce(c->>'tier_notify', 'cleared');
  v_days int := coalesce((c->>'tier_notify_days')::int, 30);
  v_p1 boolean := coalesce((c->>'tier_notify_p1')::boolean, true);
  v_max int := greatest(1, least(coalesce((c->>'tier_notify_max')::int, 300), 5000));
begin
  if v_mode = 'off' then return; end if;
  return query
  with ch as (select id, song_id, mode, level, version from charts where id = p_chart),
  pool as (
    select r.user_id from chart_reviews r where r.chart_id = p_chart
    union
    select s.user_id from user_scores s where v_mode = 'cleared' and s.chart_id = p_chart and not s.broken
    union
    select s.user_id from user_scores s join charts o on o.id = s.chart_id join ch on true
     where v_mode = 'cleared' and v_p1 and not s.broken
       and o.song_id = ch.song_id and o.mode = ch.mode and o.level = ch.level and o.version <> ch.version
  ),
  active as (
    select p.user_id, max(u.taken_at) last_sync from pool p left join user_profiles u on u.user_id = p.user_id group by p.user_id
  )
  select a.user_id from active a
   where a.user_id <> p_me
     and (v_days <= 0 or a.last_sync > now() - make_interval(days => v_days)
          or exists (select 1 from chart_reviews r where r.chart_id = p_chart and r.user_id = a.user_id))
   order by a.last_sync desc nulls last
   limit v_max;
end $$;
revoke all on function public.tier_vote_audience(bigint, uuid) from public, anon, authenticated;

create or replace function public.propose_tier(p_chart bigint, p_to smallint, p_from smallint, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id bigint; v_hours int := coalesce((app_config()->'community'->>'tier_vote_hours')::int, 48); v_info jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  perform close_due_tier_proposals();
  if not has_cleared(me, p_chart) then raise exception 'Só quem passou o chart pode propor mudança de tier.'; end if;
  if p_to is null or p_to not between -3 and 3 then raise exception 'tier inválido'; end if;
  if p_from is not null and p_from = p_to then raise exception 'Escolha um tier diferente do atual.'; end if;
  if exists (select 1 from tier_proposals where chart_id = p_chart and status = 'open') then
    raise exception 'Já existe uma votação aberta para este chart.';
  end if;
  if (select count(*) from tier_proposals where proposer = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Limite de 10 propostas por dia.';
  end if;
  insert into tier_proposals (chart_id, proposer, from_tier, to_tier, reason, closes_at, yes)
  values (p_chart, me, p_from, p_to, nullif(trim(p_reason), ''), now() + make_interval(hours => greatest(1, least(v_hours, 336))), 1)
  returning id into v_id;
  insert into tier_votes (proposal_id, user_id, agree) values (v_id, me, true);
  select jsonb_build_object('song', s.id, 'title', s.title, 'mode', c.mode, 'level', c.level, 'to', p_to)
    into v_info from charts c join songs s on s.id = c.song_id where c.id = p_chart;
  perform notify(a.uid, 'tier_vote_open', me, v_id::text, v_info) from tier_vote_audience(p_chart, me) a;
  return v_id;
end $$;

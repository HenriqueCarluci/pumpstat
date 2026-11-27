-- 089: Sugestão de x1 recalibrada. "Bom x1" e "Nível parecido" agora exigem PUMBILITY E maior nível passado próximos.
-- Limites em app_config().x1 (editáveis no admin); padrão:
--   Bom x1:        PUMBILITY até 3% (mín. 200) de diferença e maior nível passado até 1 nível
--   Nível parecido: PUMBILITY até 7% (mín. 500) e até 2 níveis
-- O nível compara o modo em que os dois estão mais perto (Single ou Double).
-- Perfil privado: o maior nível passado não aparece para os outros.

create or replace function public.x1_match(p_my_pb numeric, p_pb numeric, p_my_max jsonb, p_max jsonb)
returns text language plpgsql stable set search_path = public as $$
declare
  c jsonb := coalesce(app_config()->'x1', '{}'::jsonb);
  d numeric; gap int; lim_close numeric; lim_near numeric;
begin
  if p_my_pb is null or p_pb is null then return null; end if;
  d := abs(p_pb - p_my_pb);
  lim_close := greatest(coalesce((c->>'close_min')::numeric, 200), p_my_pb * coalesce((c->>'close_pct')::numeric, 3) / 100);
  lim_near := greatest(coalesce((c->>'near_min')::numeric, 500), p_my_pb * coalesce((c->>'near_pct')::numeric, 7) / 100);
  select min(abs((p_my_max->>m)::int - (p_max->>m)::int)) into gap
    from unnest(array['S', 'D']) m
   where p_my_max->>m is not null and p_max->>m is not null;
  if d <= lim_close and (gap is null or gap <= coalesce((c->>'close_lv')::int, 1)) then return 'close'; end if;
  if d <= lim_near and (gap is null or gap <= coalesce((c->>'near_lv')::int, 2)) then return 'near'; end if;
  return 'far';
end $$;

create or replace function public.online_players()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_pb numeric; v_venue text; v_max jsonb;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  select pumbility into v_pb from visible_profiles where user_id = me and version = 'phoenix2' order by taken_at desc limit 1;
  select venue_slug into v_venue from user_presence where user_id = me;
  v_max := max_cleared(me);
  return (
    select coalesce(jsonb_agg(card order by same_venue desc, rank_m, diff nulls last, friend desc), '[]') from (
      select presence_card(me, p.user_id) || jsonb_build_object(
               'same_venue', v_venue is not null and p.venue_slug = v_venue,
               'venue', (select name from venues v where v.slug = p.venue_slug),
               'max', mx.m,
               'match', x.match,
               'pumbility', pb.pumbility,
               'invited', exists (select 1 from play_invites i where i.from_user = me and i.to_user = p.user_id
                                   and i.status = 'pending' and i.created_at > now() - interval '2 hours'),
               'since', p.last_seen) as card,
             (v_venue is not null and p.venue_slug = v_venue) as same_venue,
             case x.match when 'close' then 0 when 'near' then 1 else 2 end as rank_m,
             abs(pb.pumbility - v_pb) as diff,
             are_friends(me, p.user_id) as friend
        from user_presence p
        left join lateral (select pumbility from visible_profiles u where u.user_id = p.user_id and u.version = 'phoenix2'
                            order by taken_at desc limit 1) pb on true
        cross join lateral (select case when stats_private(p.user_id) then '{}'::jsonb else max_cleared(p.user_id) end as m) mx
        cross join lateral (select x1_match(v_pb, pb.pumbility, v_max, mx.m) as match) x
       where p.user_id <> me and p.last_seen > now() - interval '3 minutes'
         and not is_blocked(me, p.user_id)
         and (p.mode = 'all' or (p.mode = 'friends' and are_friends(me, p.user_id)))
    ) z);
end $$;

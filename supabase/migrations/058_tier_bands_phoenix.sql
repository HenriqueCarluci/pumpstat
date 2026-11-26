-- 058: faixas de tier para a Phoenix (1), usando a Phoenix 2 como referência.
-- 1) mesmo chart no mesmo nível → copia a faixa (inclui Unique e Sem classificação);
-- 2) mesmo stepchart com nível diferente → desloca 3 faixas por nível de diferença
--    (ex.: era S20 na Phoenix e virou S19 na 2 → na Phoenix ele é fácil para o nível), limitado a -3..3;
-- 3) chart sem par na Phoenix 2 → sem linha aqui; o app usa o fallback (scoring level).
insert into public.chart_tier_ref (chart_id, band, source)
select p.id, r.band, 'arcadestat_p2'
  from public.charts p
  join public.charts c2 on c2.version = 'phoenix2' and c2.song_id = p.song_id and c2.mode = p.mode and c2.level = p.level
  join public.chart_tier_ref r on r.chart_id = c2.id
 where p.version = 'phoenix'
on conflict (chart_id) do update set band = excluded.band, source = excluded.source, updated_at = now();

insert into public.chart_tier_ref (chart_id, band, source)
select distinct on (p.id) p.id,
       case when r.band in (8, 9) then r.band
            else greatest(-3, least(3, r.band + 3 * (c2.level - p.level))) end,
       'arcadestat_p2_shift'
  from public.charts p
  join public.charts c2 on c2.version = 'phoenix2' and c2.piuscores_id = p.piuscores_id and c2.mode = p.mode
  join public.chart_tier_ref r on r.chart_id = c2.id
 where p.version = 'phoenix' and p.piuscores_id is not null
   and not exists (select 1 from public.charts x where x.version = 'phoenix2' and x.song_id = p.song_id and x.mode = p.mode and x.level = p.level)
 order by p.id, abs(c2.level - p.level)
on conflict (chart_id) do nothing;

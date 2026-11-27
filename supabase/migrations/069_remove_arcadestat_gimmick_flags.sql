-- 069: tira as marcações "Tag Gimmick do ArcadeStat" criadas na 059 (coleta pela tela).
-- O gimmick do ArcadeStat agora vem das tags com peso (063+); as marcações feitas pela equipe continuam.
delete from public.chart_flags
 where note = 'Tag Gimmick do ArcadeStat' and updated_by is null and gimmicks = array['other'] and not special;

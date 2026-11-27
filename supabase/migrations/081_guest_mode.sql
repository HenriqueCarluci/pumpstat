-- 081: Modo visitante (sem login): só o catálogo com tier e tags, sem notas de ninguém.
-- Fica desligado até o admin ligar (app_config().guest.enabled).

create or replace function public.guest_data(p_version text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((app_config()->'guest'->>'enabled')::boolean, false) then
    raise exception 'o modo visitante está desligado' using errcode = '42501';
  end if;
  if p_version not in ('phoenix', 'phoenix2') then raise exception 'versão inválida'; end if;
  return jsonb_build_object(
    'version', p_version,
    'songs', (select coalesce(jsonb_agg(jsonb_build_array(s.id, s.title, s.artist, s.bpm, s.song_type, s.jacket_url, s.rise)), '[]'::jsonb)
                from songs s where exists (select 1 from charts c where c.song_id = s.id and c.version = p_version)),
    'charts', (select coalesce(jsonb_agg(jsonb_build_array(c.id, c.song_id, c.mode, c.level, c.step_artist, c.note_count, c.skills,
                 c.pass_difficulty, c.score_difficulty, c.scoring_level, null, null, null, null, null, null, null, false) order by c.id), '[]'::jsonb)
                 from charts c where c.version = p_version),
    'community', community_charts(p_version),
    'new_songs', new_songs(p_version),
    'ref', chart_ref_tiers(p_version),
    'tags', chart_ref_tags(p_version),
    'plays', '[]'::jsonb);
end $$;
revoke all on function public.guest_data(text) from public;
grant execute on function public.guest_data(text) to anon, authenticated;

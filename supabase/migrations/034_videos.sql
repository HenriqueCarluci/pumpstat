-- Vídeo exato do YouTube para cada chart (chave 'c:<chart_id>') e para cada música ('s:<song_id>').
-- O servidor procura uma vez pela API do YouTube e guarda aqui; o admin pode corrigir à mão.
create table if not exists public.yt_videos (
  key text primary key check (key ~ '^[cs]:\d+$'),
  video_id text check (video_id ~ '^[\w-]{11}$'),
  title text,
  channel text,
  source text not null check (source in ('auto', 'admin', 'none')),
  checked_at timestamptz not null default now(),
  set_by uuid references auth.users (id) on delete set null
);
alter table public.yt_videos enable row level security;
revoke all on public.yt_videos from anon, authenticated;

-- Dados para o servidor montar a busca e ver o que já está guardado.
create or replace function public.video_lookup(p_key text, p_kind text, p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k text := p_kind || ':' || p_id; r jsonb;
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  if p_kind = 'c' then
    select jsonb_build_object('title', s.title, 'artist', s.artist, 'mode', c.mode, 'level', c.level, 'version', c.version)
      into r from charts c join songs s on s.id = c.song_id where c.id = p_id;
  elsif p_kind = 's' then
    select jsonb_build_object('title', s.title, 'artist', s.artist) into r from songs s where s.id = p_id;
  end if;
  if r is null then return null; end if;
  return r || jsonb_build_object('cached', (select to_jsonb(v) - 'set_by' from yt_videos v where v.key = k));
end $$;
revoke all on function public.video_lookup(text, text, bigint) from public, anon, authenticated;
grant execute on function public.video_lookup(text, text, bigint) to anon;

create or replace function public.video_save(p_key text, p_vkey text, p_video text, p_title text, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not server_key_ok(p_key) then raise exception 'chave inválida' using errcode = '28000'; end if;
  insert into yt_videos (key, video_id, title, channel, source, checked_at)
  values (p_vkey, p_video, left(p_title, 200), left(p_channel, 100), case when p_video is null then 'none' else 'auto' end, now())
  on conflict (key) do update set video_id = excluded.video_id, title = excluded.title, channel = excluded.channel,
    source = excluded.source, checked_at = now()
  where yt_videos.source <> 'admin';
end $$;
revoke all on function public.video_save(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.video_save(text, text, text, text, text) to anon;

-- Admin: define (ou apaga, com p_video nulo) o vídeo de um chart ou música.
create or replace function public.admin_set_video(p_vkey text, p_video text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_vkey !~ '^[cs]:\d+$' then raise exception 'chave de vídeo inválida'; end if;
  if p_video is null then delete from yt_videos where key = p_vkey; return; end if;
  if p_video !~ '^[\w-]{11}$' then raise exception 'link do YouTube inválido'; end if;
  insert into yt_videos (key, video_id, source, checked_at, set_by) values (p_vkey, p_video, 'admin', now(), auth.uid())
  on conflict (key) do update set video_id = excluded.video_id, title = null, channel = null, source = 'admin', checked_at = now(), set_by = auth.uid();
end $$;
revoke all on function public.admin_set_video(text, text) from public, anon;
grant execute on function public.admin_set_video(text, text) to authenticated;

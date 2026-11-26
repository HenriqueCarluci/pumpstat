-- 050: redes sociais no perfil (opcional). A pessoa escolhe quem vê: amigos (padrão), todos ou ninguém.
-- Guarda só o nome de usuário de cada rede; o app monta o link.
create table if not exists public.user_socials (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  instagram  text check (length(instagram) <= 40),
  twitch     text check (length(twitch) <= 40),
  youtube    text check (length(youtube) <= 40),
  tiktok     text check (length(tiktok) <= 40),
  x          text check (length(x) <= 40),
  discord    text check (length(discord) <= 40),
  visibility text not null default 'friends' check (visibility in ('friends', 'all', 'hidden')),
  updated_at timestamptz not null default now()
);
alter table public.user_socials enable row level security;
revoke all on public.user_socials from anon, authenticated;

-- tira @, espaços e o começo do link (instagram.com/fulano → fulano)
create or replace function public.social_handle(p text, p_net text)
returns text language plpgsql immutable set search_path = public as $$
declare v text := trim(coalesce(p, ''));
begin
  v := regexp_replace(v, '^https?://', '', 'i');
  v := regexp_replace(v, '^(www\.|m\.)', '', 'i');
  v := regexp_replace(v, '^(instagram\.com|twitch\.tv|youtube\.com|tiktok\.com|x\.com|twitter\.com|discord\.com/users)/', '', 'i');
  v := regexp_replace(v, '^@', '');
  v := regexp_replace(v, '[/?#].*$', '');
  v := regexp_replace(v, '^@', '');
  if v = '' then return null; end if;
  if length(v) > 40 or v !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'Nome de usuário inválido em %: use só letras, números, ponto, traço ou sublinhado.', p_net;
  end if;
  return v;
end $$;

create or replace function public.my_socials()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select to_jsonb(s) - 'user_id' - 'updated_at' from user_socials s where s.user_id = auth.uid()),
                  jsonb_build_object('visibility', 'friends'))
$$;

create or replace function public.set_socials(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_vis text := coalesce(p->>'visibility', 'friends');
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if v_vis not in ('friends', 'all', 'hidden') then raise exception 'opção inválida'; end if;
  insert into user_socials (user_id, instagram, twitch, youtube, tiktok, x, discord, visibility, updated_at)
  values (me, social_handle(p->>'instagram', 'Instagram'), social_handle(p->>'twitch', 'Twitch'), social_handle(p->>'youtube', 'YouTube'),
          social_handle(p->>'tiktok', 'TikTok'), social_handle(p->>'x', 'X'), social_handle(p->>'discord', 'Discord'), v_vis, now())
  on conflict (user_id) do update set instagram = excluded.instagram, twitch = excluded.twitch, youtube = excluded.youtube,
    tiktok = excluded.tiktok, x = excluded.x, discord = excluded.discord, visibility = excluded.visibility, updated_at = now();
  return my_socials();
end $$;

-- redes de outra pessoa: só se ela deixou visível para você (e ninguém bloqueou ninguém)
create or replace function public.socials_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(s) - 'user_id' - 'updated_at' - 'visibility'
    from user_socials s
   where s.user_id = p_user and auth.uid() is not null
     and (p_user = auth.uid()
          or (not is_blocked(auth.uid(), p_user)
              and (s.visibility = 'all' or (s.visibility = 'friends' and are_friends(auth.uid(), p_user)))))
$$;

revoke all on function public.social_handle(text, text) from public, anon;
revoke all on function public.my_socials() from public, anon;
revoke all on function public.set_socials(jsonb) from public, anon;
revoke all on function public.socials_of(uuid) from public, anon;
grant execute on function public.my_socials() to authenticated;
grant execute on function public.set_socials(jsonb) to authenticated;
grant execute on function public.socials_of(uuid) to authenticated;

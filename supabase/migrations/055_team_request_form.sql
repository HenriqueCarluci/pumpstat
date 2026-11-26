-- 055: pedido de time como formulário: logo (arquivo enviado pelo app), Instagram e outras redes, sobre o time e contato.
-- O logo vai para o bucket público "team-logos", na pasta de quem pediu; o admin recebe o pedido por e-mail (API) e no painel.
alter table public.teams add column if not exists socials jsonb not null default '{}'::jsonb
  check (jsonb_typeof(socials) = 'object' and length(socials::text) <= 600);
alter table public.teams add column if not exists about text check (about is null or length(about) <= 500);
alter table public.teams add column if not exists contact text check (contact is null or length(contact) <= 120);
alter table public.teams add column if not exists emailed_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- cada pessoa só envia arquivos para a própria pasta (team-logos/<id da conta>/...); leitura é pelo link público
drop policy if exists "team logos: upload na própria pasta" on storage.objects;
create policy "team logos: upload na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- nome de usuário de uma rede do time (Discord aceita o convite: discord.gg/xxxx)
create or replace function public.team_social_handle(p text, p_net text)
returns text language plpgsql immutable set search_path = public as $$
declare v text := trim(coalesce(p, ''));
begin
  if p_net = 'discord' then
    v := regexp_replace(v, '^https?://', '', 'i');
    v := regexp_replace(v, '^(www\.)?(discord\.gg|discord\.com/invite|discordapp\.com/invite)/', '', 'i');
    v := regexp_replace(v, '[/?#].*$', '');
    if v = '' then return null; end if;
    if length(v) > 40 or v !~ '^[A-Za-z0-9-]+$' then raise exception 'Convite do Discord inválido: cole o link discord.gg/...'; end if;
    return v;
  end if;
  return social_handle(p, p_net);
end $$;
revoke all on function public.team_social_handle(text, text) from public, anon;

create or replace function public.request_team_form(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id bigint; v_name text := trim(coalesce(p->>'name', ''));
        v_tag text := nullif(upper(trim(coalesce(p->>'tag', ''))), ''); v_logo text := nullif(trim(coalesce(p->>'logo', '')), '');
        v_ig text := social_handle(p->>'instagram', 'Instagram'); v_soc jsonb := '{}'::jsonb; k text; h text;
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if length(v_name) < 2 or length(v_name) > 40 then raise exception 'O nome do time precisa ter de 2 a 40 letras.'; end if;
  if v_tag is not null and v_tag !~ '^[A-Z0-9]{2,5}$' then raise exception 'A sigla precisa ter de 2 a 5 letras ou números.'; end if;
  if v_ig is not null and v_ig !~ '^[A-Za-z0-9._]{1,30}$' then raise exception 'Nome de usuário inválido em %: use só letras, números, ponto, traço ou sublinhado.', 'Instagram'; end if;
  if v_logo is not null and v_logo !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/team-logos/' || me::text || '/[A-Za-z0-9-]+\.(png|jpg|webp)$') then
    raise exception 'Envie o logo pelo próprio formulário.';
  end if;
  foreach k in array array['tiktok', 'youtube', 'twitch', 'x', 'discord'] loop
    h := team_social_handle(p->'socials'->>k, k);
    if h is not null then v_soc := v_soc || jsonb_build_object(k, h); end if;
  end loop;
  if exists (select 1 from teams where created_by = me and status = 'pending') then
    raise exception 'Você já tem um pedido de time esperando aprovação.';
  end if;
  if exists (select 1 from teams where lower(name) = lower(v_name) and status <> 'rejected') then
    raise exception 'Já existe um time com esse nome.';
  end if;
  insert into teams (name, tag, city, created_by, logo_url, instagram, socials, about, contact)
  values (v_name, v_tag, nullif(left(trim(coalesce(p->>'city', '')), 60), ''), me, v_logo, v_ig, v_soc,
          nullif(left(trim(coalesce(p->>'about', '')), 500), ''), nullif(left(trim(coalesce(p->>'contact', '')), 120), ''))
  returning id into v_id;
  perform notify_admins('admin_team_request', me, v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end $$;
revoke all on function public.request_team_form(jsonb) from public, anon;
grant execute on function public.request_team_form(jsonb) to authenticated;

-- a API lê o pedido para montar o e-mail (só de quem pediu, uma vez, na primeira hora)
create or replace function public.team_request_mail(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t teams; v_nick text;
begin
  select * into t from teams where id = p_id and created_by = auth.uid() and status = 'pending'
     and emailed_at is null and created_at > now() - interval '1 hour' for update;
  if not found then return null; end if;
  update teams set emailed_at = now() where id = p_id;
  select nickname into v_nick from user_profiles where user_id = auth.uid() order by taken_at desc limit 1;
  return jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city, 'logo', t.logo_url, 'instagram', t.instagram,
                            'socials', t.socials, 'about', t.about, 'contact', t.contact, 'nickname', v_nick);
end $$;
revoke all on function public.team_request_mail(bigint) from public, anon;
grant execute on function public.team_request_mail(bigint) to authenticated;

-- admin: trocar/tirar o logo e as redes antes ou depois de aprovar
create or replace function public.admin_set_team_media(p_id bigint, p_logo text, p_instagram text, p_socials jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_soc jsonb := '{}'::jsonb; k text; h text;
begin
  perform admin_guard();
  foreach k in array array['tiktok', 'youtube', 'twitch', 'x', 'discord'] loop
    h := team_social_handle(coalesce(p_socials, '{}'::jsonb)->>k, k);
    if h is not null then v_soc := v_soc || jsonb_build_object(k, h); end if;
  end loop;
  update teams set logo_url = nullif(trim(coalesce(p_logo, '')), ''), instagram = social_handle(p_instagram, 'Instagram'), socials = v_soc
   where id = p_id;
  if not found then raise exception 'time não encontrado'; end if;
end $$;
revoke all on function public.admin_set_team_media(bigint, text, text, jsonb) from public, anon;
grant execute on function public.admin_set_team_media(bigint, text, text, jsonb) to authenticated;

create or replace function public.list_teams()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city,
               'logo', t.logo_url, 'instagram', t.instagram,
               'members', (select count(*) from team_members m where m.team_id = t.id)) order by lower(t.name))
             from teams t where t.status = 'approved'), '[]'::jsonb),
    'mine', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo_url, 'instagram', t.instagram, 'socials', t.socials)
               from team_members m join teams t on t.id = m.team_id where m.user_id = auth.uid()),
    'pending', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo_url, 'status', t.status, 'admin_note', t.admin_note)
                  from teams t where t.created_by = auth.uid() and (t.status = 'pending' or (t.status = 'rejected' and t.reviewed_at > now() - interval '14 days'))
                 order by t.created_at desc limit 1))
$$;

-- Meu Time: inclui as redes do time
create or replace function public.my_team(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  tm as (select m.team_id from team_members m, me where m.user_id = me.id limit 1),
  mem as (select m.user_id, m.joined_at from team_members m join tm on tm.team_id = m.team_id),
  lvl as (
    select s.user_id,
           max(c.level) filter (where c.mode = 'S') as max_s,
           max(c.level) filter (where c.mode = 'D') as max_d,
           count(*) filter (where c.mode in ('S', 'D')) as clears
      from user_scores s join charts c on c.id = s.chart_id and c.version = p_version
     where s.user_id in (select user_id from mem) and not coalesce(s.broken, false)
     group by s.user_id
  ),
  week as (
    select count(*) as plays, count(*) filter (where not p.broken) as passes, count(distinct p.user_id) as active
      from user_plays p join charts c on c.id = p.chart_id and c.version = p_version
     where p.user_id in (select user_id from mem) and p.played_at > now() - interval '7 days'
  )
  select case when not exists (select 1 from tm) then null else jsonb_build_object(
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'city', t.city, 'logo', t.logo_url, 'instagram', t.instagram, 'socials', t.socials)
               from teams t join tm on tm.team_id = t.id),
    'week', (select jsonb_build_object('plays', plays, 'passes', passes, 'active', active) from week),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.user_id, 'me', m.user_id = (select id from me), 'joined', m.joined_at,
               'friend', are_friends((select id from me), m.user_id),
               'nickname', pr.nickname, 'title', pr.title, 'avatar', pr.avatar_url, 'pumbility', pr.pumbility,
               'max_s', l.max_s, 'max_d', l.max_d, 'clears', coalesce(l.clears, 0),
               'online', exists (select 1 from user_presence up where up.user_id = m.user_id and up.last_seen > now() - interval '3 minutes'
                                  and (up.mode = 'all' or (up.mode = 'friends' and are_friends((select id from me), m.user_id))))
             ) order by pr.pumbility desc nulls last), '[]'::jsonb)
        from mem m
        left join lvl l on l.user_id = m.user_id
        left join lateral (select nickname, title, avatar_url, pumbility from user_profiles p
                            where p.user_id = m.user_id and p.version = p_version order by taken_at desc limit 1) pr on true
       where not is_blocked((select id from me), m.user_id) or m.user_id = (select id from me)
    )) end
$$;
revoke all on function public.my_team(text) from public, anon;
grant execute on function public.my_team(text) to authenticated;

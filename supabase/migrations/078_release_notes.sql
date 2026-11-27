-- 078: Novidades (release notes) dentro do app: o que foi lançado e o que vem por aí.
-- Texto em jsonb por idioma ({"pt": "...", "en": "...", "es": "..."}); o app mostra o idioma da pessoa e cai no pt.
-- Edição pelo admin (permissão 'config').

create table if not exists public.release_notes (
  id bigserial primary key,
  status text not null default 'released' check (status in ('released', 'soon')),
  released_on date,
  tag text not null default 'new' check (tag in ('new', 'improved', 'fixed')),
  title jsonb not null,
  body jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (title ? 'pt' and length(title->>'pt') between 1 and 120),
  check (octet_length(body::text) <= 8000)
);
alter table public.release_notes enable row level security;
-- sem políticas: leitura e escrita só pelas funções abaixo

create or replace function public.release_notes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(n) - 'published' - 'created_at' - 'updated_at'
           order by (n.status = 'soon'), n.released_on desc nulls last, n.sort, n.id desc), '[]'::jsonb)
    from release_notes n
   where n.published
$$;
revoke all on function public.release_notes() from public;
grant execute on function public.release_notes() to anon, authenticated;

create or replace function public.admin_release_notes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('config');
  return coalesce((select jsonb_agg(to_jsonb(n) order by (n.status = 'soon'), n.released_on desc nulls last, n.sort, n.id desc)
                     from release_notes n), '[]'::jsonb);
end $$;
revoke all on function public.admin_release_notes() from public, anon;
grant execute on function public.admin_release_notes() to authenticated;

create or replace function public.admin_save_release_note(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r release_notes;
  v_title jsonb := (select coalesce(jsonb_object_agg(k, left(btrim(v), 120)), '{}'::jsonb)
                      from jsonb_each_text(coalesce(p->'title', '{}'::jsonb)) e(k, v)
                     where k in ('pt','en','es','ko','ja','fr','it') and btrim(v) <> '');
  v_body jsonb := (select coalesce(jsonb_object_agg(k, left(btrim(v), 1500)), '{}'::jsonb)
                     from jsonb_each_text(coalesce(p->'body', '{}'::jsonb)) e(k, v)
                    where k in ('pt','en','es','ko','ja','fr','it') and btrim(v) <> '');
begin
  perform admin_guard('config');
  if not v_title ? 'pt' then raise exception 'escreva o título em português'; end if;
  if coalesce(p->>'status', 'released') not in ('released', 'soon') then raise exception 'situação inválida'; end if;
  if coalesce(p->>'tag', 'new') not in ('new', 'improved', 'fixed') then raise exception 'tipo inválido'; end if;
  if nullif(p->>'id', '') is null then
    insert into release_notes (status, released_on, tag, title, body, published, sort)
    values (coalesce(p->>'status', 'released'),
            case when coalesce(p->>'status', 'released') = 'released' then coalesce(nullif(p->>'released_on', '')::date, current_date) else nullif(p->>'released_on', '')::date end,
            coalesce(p->>'tag', 'new'), v_title, v_body, coalesce((p->>'published')::boolean, true), coalesce((p->>'sort')::int, 0))
    returning * into r;
  else
    update release_notes set
      status = coalesce(p->>'status', status),
      released_on = case when coalesce(p->>'status', status) = 'released' then coalesce(nullif(p->>'released_on', '')::date, released_on, current_date) else nullif(p->>'released_on', '')::date end,
      tag = coalesce(p->>'tag', tag), title = v_title, body = v_body,
      published = coalesce((p->>'published')::boolean, published), sort = coalesce((p->>'sort')::int, sort), updated_at = now()
     where id = (p->>'id')::bigint returning * into r;
    if not found then raise exception 'novidade não encontrada'; end if;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.admin_save_release_note(jsonb) from public, anon;
grant execute on function public.admin_save_release_note(jsonb) to authenticated;

create or replace function public.admin_delete_release_note(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('config');
  delete from release_notes where id = p_id;
end $$;
revoke all on function public.admin_delete_release_note(bigint) from public, anon;
grant execute on function public.admin_delete_release_note(bigint) to authenticated;

-- primeiras novidades
insert into release_notes (status, released_on, tag, title, body, sort) values
('released', '2026-11-27', 'new',
 '{"pt":"Missões da semana personalizadas","en":"Personalized weekly missions","es":"Misiones semanales personalizadas"}',
 '{"pt":"Metas montadas pelo seu histórico, com charts nomeados, foco da semana, troca de missão, pontos e selos. Só na Phoenix 2.","en":"Goals built from your history, with named charts, weekly focus, mission swaps, points and badges. Phoenix 2 only.","es":"Metas armadas con tu historial, con charts nombrados, foco de la semana, cambio de misión, puntos y sellos. Solo en Phoenix 2."}', 1),
('released', '2026-11-27', 'new',
 '{"pt":"PIU Stats no computador","en":"PIU Stats on desktop","es":"PIU Stats en la computadora"}',
 '{"pt":"Em piustats.com.br o site tem cara de site: menu lateral, busca com Ctrl+K e páginas em colunas.","en":"At piustats.com.br the site now looks like a website: side menu, Ctrl+K search and multi-column pages.","es":"En piustats.com.br el sitio tiene cara de sitio: menú lateral, búsqueda con Ctrl+K y páginas en columnas."}', 2),
('released', '2026-11-27', 'improved',
 '{"pt":"Atalhos do início e redes no perfil","en":"Home shortcuts and profile socials","es":"Atajos del inicio y redes en el perfil"}',
 '{"pt":"Os 4 atalhos que você mais usa ficam numa linha (dá para fixar) e o resto vai para “Mais”. As redes sociais aparecem como ícones no topo do perfil.","en":"Your 4 most used shortcuts sit in one row (you can pin them) and the rest go into “More”. Social links show as icons at the top of the profile.","es":"Tus 4 atajos más usados quedan en una fila (se pueden fijar) y el resto va a “Más”. Las redes aparecen como íconos arriba del perfil."}', 3),
('released', '2026-11-27', 'new',
 '{"pt":"Mapa e check-in na fila","en":"Map and queue check-in","es":"Mapa y check-in en la fila"}',
 '{"pt":"Mapa dos fliperamas com Pump, check-in rápido para quem está logado e QR code no modo TV.","en":"Map of arcades with Pump, quick check-in when logged in and a QR code on TV mode.","es":"Mapa de los arcades con Pump, check-in rápido con sesión iniciada y código QR en el modo TV."}', 4),
('released', '2026-11-27', 'new',
 '{"pt":"Página do chart e perfil do jogador","en":"Chart page and player profile","es":"Página del chart y perfil del jugador"}',
 '{"pt":"Cada nível tem sua página com recorde, números da comunidade, skills do ArcadeStat e histórico. O perfil mostra top 50, notas, placas e estilo de jogo.","en":"Each level has its own page with your record, community numbers, ArcadeStat skills and history. Profiles show top 50, scores, plates and play style.","es":"Cada nivel tiene su página con récord, números de la comunidad, skills de ArcadeStat e historial. El perfil muestra top 50, notas, placas y estilo de juego."}', 5),
('released', '2026-11-26', 'new',
 '{"pt":"Dia de jogo","en":"Game day report","es":"Día de juego"}',
 '{"pt":"Relatório do dia com primeiros passes, upscores e evolução, e imagens para postar no feed ou nos stories.","en":"Daily report with first passes, upscores and progress, plus images to post on your feed or stories.","es":"Reporte del día con primeros pases, upscores y evolución, e imágenes para publicar en el feed o en las historias."}', 6),
('released', '2026-11-26', 'new',
 '{"pt":"Meu Time e Meu treino","en":"My Team and My training","es":"Mi Equipo y Mi entrenamiento"}',
 '{"pt":"Times com relatório por dia, semana e mês. No Meu treino você acompanha tentativas, quebras e passes de cada música.","en":"Teams with daily, weekly and monthly reports. My training tracks attempts, breaks and passes for each song.","es":"Equipos con reporte por día, semana y mes. En Mi entrenamiento sigues intentos, quiebres y pases de cada canción."}', 7),
('released', '2026-11-26', 'improved',
 '{"pt":"Tier com dados do ArcadeStat","en":"Tier with ArcadeStat data","es":"Tier con datos de ArcadeStat"}',
 '{"pt":"Faixas de dificuldade e skills de cada chart vêm da comunidade ArcadeStat, com seção Unique e filtro de músicas novas.","en":"Difficulty bands and chart skills come from the ArcadeStat community, with a Unique section and a new songs filter.","es":"Las franjas de dificultad y las skills de cada chart vienen de la comunidad ArcadeStat, con sección Unique y filtro de canciones nuevas."}', 8),
('soon', null, 'new',
 '{"pt":"Planos Plus e Pro","en":"Plus and Pro plans","es":"Planes Plus y Pro"}',
 '{"pt":"Análises, treino e recursos sociais a mais, com preço de lançamento nos primeiros meses. O que é grátis hoje continua grátis.","en":"Extra analysis, training and social features, with a launch price for the first months. What is free today stays free.","es":"Más análisis, entrenamiento y funciones sociales, con precio de lanzamiento los primeros meses. Lo que hoy es gratis sigue gratis."}', 1),
('soon', null, 'new',
 '{"pt":"Sincronização automática","en":"Automatic sync","es":"Sincronización automática"}',
 '{"pt":"Suas notas atualizadas sozinhas depois de jogar, sem abrir o app.","en":"Your scores update on their own after you play, without opening the app.","es":"Tus notas se actualizan solas después de jugar, sin abrir la app."}', 2),
('soon', null, 'new',
 '{"pt":"Notificação com o app fechado","en":"Notifications with the app closed","es":"Notificaciones con la app cerrada"}',
 '{"pt":"Avisos de convite, vez na fila e recorde de amigo mesmo com o app fechado.","en":"Alerts for invites, your turn in the queue and friends'' records even with the app closed.","es":"Avisos de invitación, tu turno en la fila y récords de amigos incluso con la app cerrada."}', 3),
('soon', null, 'new',
 '{"pt":"Exportar tier e cards em imagem","en":"Export tier and cards as images","es":"Exportar tier y cards como imagen"}',
 '{"pt":"Salve seu tier e seus cards de nota como imagem para compartilhar.","en":"Save your tier and score cards as images to share.","es":"Guarda tu tier y tus cards de nota como imagen para compartir."}', 4);

-- rascunho: depende de autorização da LBPIU
insert into release_notes (status, tag, title, body, published, sort) values
('soon', 'new', '{"pt":"Competições no perfil (CBPIU e LBPIU)","en":"Competitions on your profile (CBPIU and LBPIU)","es":"Competencias en el perfil (CBPIU y LBPIU)"}',
 '{"pt":"Etapas do CBPIU, campeonatos, títulos e medalhas no seu perfil.","en":"CBPIU stages, championships, titles and medals on your profile.","es":"Etapas del CBPIU, campeonatos, títulos y medallas en tu perfil."}', false, 5);

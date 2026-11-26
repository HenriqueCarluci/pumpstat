-- 060: tags dos charts no padrão do ArcadeStat (escolhidas por pessoas, chart a chart).
-- Viram as tags principais do app; o piucenter continua como apoio (% de cada padrão).
create table if not exists public.chart_tags_ref (
  chart_id   bigint not null references public.charts (id) on delete cascade,
  tag        text not null check (tag ~ '^[a-z0-9_]+$'),
  source     text not null default 'arcadestat',
  updated_at timestamptz not null default now(),
  primary key (chart_id, tag)
);
alter table public.chart_tags_ref enable row level security;
revoke all on public.chart_tags_ref from anon, authenticated;

-- [[chart_id, [tags]]] da versão
create or replace function public.chart_ref_tags(p_version text default 'phoenix2')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.chart_id, x.tags)), '[]'::jsonb)
    from (select t.chart_id, jsonb_agg(t.tag order by t.tag) tags
            from chart_tags_ref t join charts c on c.id = t.chart_id and c.version = p_version
           group by t.chart_id) x
$$;
revoke all on function public.chart_ref_tags(text) from public;
grant execute on function public.chart_ref_tags(text) to anon, authenticated;
-- os dados (uma tag por vez, lidos do filtro de tags do ArcadeStat) entram em 061_chart_tags_data.sql

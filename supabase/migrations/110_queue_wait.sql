-- Tempo de espera nas filas: o padrão é o tempo de uma ficha (configurável no admin: queue_turn_min, 18 min se vazio).
-- O tempo aprendido pelas "passadas de vez" só vale quando há amostras suficientes.
create or replace function public.queue_turn_sec(p_machine bigint)
 returns int language sql stable security definer set search_path to 'public'
as $$
  with d as (
    select at - lag(at) over (order by at) d from queue_events
     where machine_id = p_machine and kind = 'pass' and at > now() - interval '30 days'
  ), ok as (select d from d where d > interval '2 minutes' and d < interval '40 minutes')
  select case when (select count(*) from ok) >= 10 then (select extract(epoch from avg(d))::int from ok)
              else coalesce(nullif(app_config()->>'queue_turn_min', '')::numeric, 18)::int * 60 end
$$;

create or replace function public.venue_data(p_slug text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'venue', to_jsonb(v) - 'created_by',
    'is_admin', exists (select 1 from venue_admins a where a.venue_id = v.id and a.user_id = auth.uid()),
    'machines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name,
        'avg_turn_sec', queue_turn_sec(m.id),
        'last_event', (select max(at) from queue_events where machine_id = m.id)
      ) order by m.sort, m.id)
      from machines m where m.venue_id = v.id and m.active), '[]'::jsonb)
  )
  from venues v where v.slug = p_slug
$$;

-- resumo para a lista de fliperamas: quantos esperando e a espera na máquina mais livre
create or replace function public.venues_queue_summary()
 returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_object_agg(slug, jsonb_build_object('waiting', waiting, 'wait_min', wait_min)), '{}'::jsonb)
    from (
      select v.slug,
             sum(q.n)::int as waiting,
             min(round(q.n * queue_turn_sec(m.id) / 60.0))::int as wait_min
        from venues v
        join machines m on m.venue_id = v.id and m.active
        cross join lateral (select count(*) as n from queue_entries e where e.machine_id = m.id and e.status = 'waiting') q
       where v.active
       group by v.slug
    ) s
$$;
grant execute on function public.venues_queue_summary() to anon, authenticated;

-- onde a pessoa jogou por último (check-ins e presença no fliperama)
create or replace function public.my_recent_venues(p_limit int default 4)
 returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', v.slug, 'name', v.name, 'city', v.city, 'last', x.last) order by x.last desc), '[]'::jsonb)
    from (select venue_id, max(day) as last from user_venue_visits where user_id = auth.uid() group by venue_id
           order by max(day) desc limit least(greatest(coalesce(p_limit, 4), 1), 10)) x
    join venues v on v.id = x.venue_id and v.active
$$;
grant execute on function public.my_recent_venues(int) to authenticated;

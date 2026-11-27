-- 076: monitoramento da plataforma no admin.
-- client_errors: erros de JavaScript enviados pelo app (com limite por pessoa) para diagnóstico.
-- admin_health(): banco (tamanho, conexões, cache, maiores tabelas, consultas mais pesadas), uso (ativos, sincronizações
-- por hora), tarefas agendadas, importação do ArcadeStat, filas e erros do app.

create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  at         timestamptz not null default now(),
  message    text not null,
  source     text,
  stack      text,
  route      text,
  build      text,
  platform   text,
  user_agent text
);
create index if not exists client_errors_at_idx on public.client_errors (at desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

create or replace function public.log_client_error(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or jsonb_typeof(p) <> 'object' then return; end if;
  -- no máximo 20 por pessoa por hora; a tabela guarda 30 dias
  if (select count(*) from client_errors where user_id = me and at > now() - interval '1 hour') >= 20 then return; end if;
  insert into client_errors (user_id, message, source, stack, route, build, platform, user_agent)
  values (me, left(coalesce(p->>'message', '?'), 500), left(p->>'source', 300), left(p->>'stack', 2000), left(p->>'route', 200),
          left(p->>'build', 40), left(p->>'platform', 20), left(p->>'ua', 300));
  delete from client_errors where at < now() - interval '30 days';
end $$;
revoke all on function public.log_client_error(jsonb) from public, anon;
grant execute on function public.log_client_error(jsonb) to authenticated;

create or replace function public.admin_health()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_stmts jsonb;
  v_cron jsonb;
begin
  perform admin_guard('stats');
  begin
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_stmts from (
      select coalesce(substring(s.query from '"public"\."([a-z_0-9]+)"'), substring(s.query from 'from\s+"?public"?\."?([a-z_0-9]+)'), left(regexp_replace(s.query, '\s+', ' ', 'g'), 120)) as q,
             s.calls,
             round(s.mean_exec_time::numeric, 1) as mean_ms, round(s.total_exec_time::numeric / 1000, 1) as total_s
        from pg_stat_statements s
       where s.dbid = (select oid from pg_database where datname = current_database())
         and s.query !~* '^\s*(begin|commit|set |show |select set_config)'
       order by s.total_exec_time desc limit 10) x;
  exception when others then v_stmts := null;
  end;
  begin
    select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) into v_cron from (
      select j.jobname as name, j.schedule, j.active,
             (select jsonb_build_object('status', d.status, 'start', d.start_time, 'ms', round(extract(epoch from (d.end_time - d.start_time)) * 1000),
                                        'msg', left(d.return_message, 160))
                from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) as last,
             (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours') as fails_24h
        from cron.job j) x;
  exception when others then v_cron := null;
  end;
  return jsonb_build_object(
    'at', now(),
    'db', jsonb_build_object(
      'size', pg_database_size(current_database()),
      'connections', (select jsonb_object_agg(coalesce(state, 'outro'), n) from (select state, count(*) as n from pg_stat_activity where datname = current_database() group by state) c),
      'max_connections', current_setting('max_connections')::int,
      'cache_hit', (select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) from pg_statio_user_tables),
      'index_hit', (select round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) from pg_statio_user_indexes),
      'tables', (select jsonb_agg(t) from (
                   select c.relname as name, greatest(c.reltuples, 0)::bigint as rows, pg_total_relation_size(c.oid) as bytes,
                          coalesce(st.n_dead_tup, 0) as dead
                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     left join pg_stat_user_tables st on st.relid = c.oid
                    where n.nspname = 'public' and c.relkind = 'r'
                    order by pg_total_relation_size(c.oid) desc limit 12) t),
      'statements', v_stmts),
    'usage', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'online_now', (select count(*) from user_presence where last_seen > now() - interval '5 minutes'),
      'active_24h', (select count(distinct user_id) from user_syncs where started_at > now() - interval '24 hours'),
      'active_7d', (select count(distinct user_id) from user_syncs where started_at > now() - interval '7 days'),
      'syncs_24h', (select count(*) from user_syncs where started_at > now() - interval '24 hours'),
      'syncs_by_hour', (select coalesce(jsonb_agg(jsonb_build_array(h, n) order by h), '[]'::jsonb) from (
                          select date_trunc('hour', started_at) as h, count(*) as n from user_syncs
                           where started_at > now() - interval '24 hours' group by 1) x),
      'sources_7d', (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb) from (
                       select source, count(*) as n from user_syncs where started_at > now() - interval '7 days' group by 1) x),
      'unmatched_7d', (select coalesce(sum(jsonb_array_length(unmatched)), 0) from user_syncs
                        where started_at > now() - interval '7 days' and jsonb_typeof(unmatched) = 'array'),
      'last_sync', (select max(started_at) from user_syncs),
      'plays_24h', (select count(*) from user_plays where played_at > now() - interval '24 hours'),
      'notifications_unread', (select count(*) from notifications where created_at > now() - interval '7 days'),
      'queue_now', (select count(*) from queue_entries)),
    'jobs', v_cron,
    'arcadestat', (select jsonb_build_object('at', ran_at, 'rows', rows_in, 'matched', matched,
                     'unmatched', case when jsonb_typeof(unmatched) = 'array' then jsonb_array_length(unmatched) end)
                     from arcadestat_sync order by ran_at desc limit 1),
    'errors', jsonb_build_object(
      'count_24h', (select count(*) from client_errors where at > now() - interval '24 hours'),
      'users_24h', (select count(distinct user_id) from client_errors where at > now() - interval '24 hours'),
      'top', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
                select message, count(*) as n, max(at) as last, count(distinct user_id) as users,
                       (array_agg(route order by at desc))[1] as route, (array_agg(platform order by at desc))[1] as platform,
                       (array_agg(build order by at desc))[1] as build, (array_agg(left(stack, 600) order by at desc))[1] as stack
                  from client_errors where at > now() - interval '7 days'
                 group by message order by count(*) desc limit 15) e)));
end $$;
revoke all on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated;

create or replace function public.admin_clear_client_errors()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('config');
  delete from client_errors;
end $$;
revoke all on function public.admin_clear_client_errors() from public, anon;
grant execute on function public.admin_clear_client_errors() to authenticated;

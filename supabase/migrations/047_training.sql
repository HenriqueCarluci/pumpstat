-- 047: Meu treino — a lista de charts que a pessoa quer treinar (até 60).
create table if not exists public.training_charts (
  user_id  uuid   not null references auth.users(id) on delete cascade,
  chart_id bigint not null references public.charts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, chart_id)
);
alter table public.training_charts enable row level security;
drop policy if exists "dono" on public.training_charts;
create policy "dono" on public.training_charts for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.training_charts from anon, authenticated;

create or replace function public.my_training()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(chart_id, extract(epoch from added_at)::bigint) order by added_at), '[]'::jsonb)
    from training_charts where user_id = auth.uid()
$$;

create or replace function public.training_set(p_chart bigint, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login primeiro' using errcode = '28000'; end if;
  if p_on then
    if (select count(*) from training_charts where user_id = me) >= 60 then
      raise exception 'seu treino já tem 60 músicas; tire alguma antes de adicionar outra';
    end if;
    insert into training_charts (user_id, chart_id) select me, id from charts where id = p_chart on conflict do nothing;
  else
    delete from training_charts where user_id = me and chart_id = p_chart;
  end if;
  return my_training();
end $$;
revoke all on function public.my_training() from public, anon;
revoke all on function public.training_set(bigint, boolean) from public, anon;
grant execute on function public.my_training() to authenticated;
grant execute on function public.training_set(bigint, boolean) to authenticated;

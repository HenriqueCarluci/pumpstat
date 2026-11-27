-- "Ver como" uma conta de teste deixa gravar (é uma conta dummy): o admin testa fluxos de verdade, como pedir
-- entrada num time ou entrar numa fila. Com pessoas reais o modo continua só leitura.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.my_plan'::regproc);
  d := replace(d, $r$'email', (select u.email from auth.users u where u.id = v.target_id))$r$,
                  $r$'email', (select u.email from auth.users u where u.id = v.target_id),
                         'test', exists (select 1 from test_accounts ta where ta.user_id = v.target_id))$r$);
  if position('''test''' in d) = 0 then raise exception 'my_plan: trecho do view_as não encontrado'; end if;
  execute d;
end $$;

create or replace function public.check_request()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_claims jsonb;
  v_sub uuid;
  v_target uuid;
  v_method text;
  v_path text;
  v_fn text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_sub := nullif(v_claims->>'sub', '')::uuid;
  exception when others then
    return;
  end;
  if v_sub is null then return; end if;

  if coalesce(v_claims->>'aal', 'aal1') <> 'aal2'
     and exists (select 1 from auth.mfa_factors f where f.user_id = v_sub and f.status = 'verified') then
    raise exception 'Confirme o código do autenticador para continuar.' using errcode = '42501', hint = 'mfa_required';
  end if;

  select a.target_id into v_target from admin_view_as a where a.admin_id = v_sub and a.expires_at > now();
  if v_target is null then return; end if;

  v_method := upper(coalesce(current_setting('request.method', true), 'GET'));
  v_path := coalesce(current_setting('request.path', true), '');
  v_fn := case when v_path like '/rpc/%' then split_part(substr(v_path, 6), '?', 1) end;

  if v_fn = 'admin_stop_view_as' then return; end if;

  -- conta de teste: pode gravar; pessoa real: só leitura
  if not exists (select 1 from test_accounts ta where ta.user_id = v_target) then
    if v_fn is not null then
      if v_fn in ('chat_with', 'my_notifications') then
        raise exception 'modo somente leitura: conversas e notificações da pessoa ficam ocultas' using errcode = '42501';
      end if;
      if v_fn not in ('tier_proposals_list') and exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = v_fn and p.provolatile = 'v') then
        raise exception 'modo somente leitura' using errcode = '42501';
      end if;
    elsif v_method not in ('GET', 'HEAD') then
      raise exception 'modo somente leitura' using errcode = '42501';
    end if;
  end if;

  perform set_config('request.jwt.claims', jsonb_set(v_claims, '{sub}', to_jsonb(v_target::text))::text, true);
  perform set_config('request.jwt.claim.sub', v_target::text, true);
  perform set_config('app.view_as_admin', v_sub::text, true);
end $function$;

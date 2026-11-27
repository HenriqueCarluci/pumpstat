-- Verificação em duas etapas: quem cadastrou o autenticador só usa o banco depois de confirmar o código (sessão aal2).
-- Fica no gancho que roda antes de cada chamada da API do banco (o mesmo do "ver como"), então vale para tudo de uma vez.
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

  perform set_config('request.jwt.claims', jsonb_set(v_claims, '{sub}', to_jsonb(v_target::text))::text, true);
  perform set_config('request.jwt.claim.sub', v_target::text, true);
  perform set_config('app.view_as_admin', v_sub::text, true);
end $function$;

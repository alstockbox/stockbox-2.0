begin;

create or replace function public.set_affiliate_ambassador_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_next_role text;
  v_prefix text;
  v_code text;
begin
  if p_actor_id = p_target_id then
    raise exception 'Admin accounts cannot change their own role';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception 'Target profile not found';
  end if;
  if v_target.role = 'admin' then
    raise exception 'Admin accounts cannot be converted to ambassador accounts';
  end if;

  v_next_role := case when p_enabled then 'affiliate_ambassador' else 'customer' end;

  update public.profiles
  set role = v_next_role,
      updated_at = now()
  where id = p_target_id;

  if p_enabled then
    v_prefix := upper(regexp_replace(split_part(coalesce(v_target.email, 'PARTNER'), '@', 1), '[^A-Za-z0-9]+', '', 'g'));
    if char_length(v_prefix) < 3 then v_prefix := 'PARTNER'; end if;
    v_code := left(v_prefix, 40) || '_' || upper(substr(md5(p_target_id::text || clock_timestamp()::text), 1, 6));

    insert into public.affiliates (
      user_id, code, status, display_name, commission_basis_points, monthly_analysis_limit, updated_at
    ) values (
      p_target_id, v_code, 'active', split_part(coalesce(v_target.email, 'Ambassador'), '@', 1), 2000, 100, now()
    )
    on conflict (user_id) do update set
      status = 'active',
      updated_at = now();
  else
    update public.affiliates
    set status = 'paused', updated_at = now()
    where user_id = p_target_id;
  end if;

  insert into public.audit_logs (
    actor_id, action, target_type, target_id, metadata
  ) values (
    p_actor_id,
    case when p_enabled then 'affiliate_ambassador_granted' else 'affiliate_ambassador_revoked' end,
    'profile',
    p_target_id::text,
    jsonb_build_object(
      'email', v_target.email,
      'previousRole', v_target.role,
      'nextRole', v_next_role
    )
  );

  return jsonb_build_object(
    'ok', true,
    'userId', p_target_id,
    'previousRole', v_target.role,
    'nextRole', v_next_role
  );
end;
$$;

revoke all on function public.set_affiliate_ambassador_role(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_affiliate_ambassador_role(uuid, uuid, boolean)
  to service_role;

commit;

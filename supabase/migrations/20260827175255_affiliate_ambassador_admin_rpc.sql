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

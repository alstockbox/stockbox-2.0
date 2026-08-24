begin;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
  end if;
end;
$$;

create index if not exists analysis_quota_reservations_analysis_id_idx
  on public.analysis_quota_reservations (analysis_id);

-- Verification query for Supabase SQL editor:
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'rls_auto_enable'
--   and grantee in ('PUBLIC', 'anon', 'authenticated')
--   and privilege_type = 'EXECUTE';
-- Expected result: zero rows.

commit;

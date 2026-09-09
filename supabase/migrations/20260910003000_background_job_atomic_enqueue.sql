begin;

create or replace function public.enqueue_background_job(
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_max_attempts integer default 5,
  p_available_at timestamptz default now()
)
returns table(id uuid, deduplicated boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_attempt integer;
begin
  if p_dedupe_key is null then
    insert into public.background_jobs (
      kind,
      status,
      payload,
      dedupe_key,
      max_attempts,
      available_at,
      updated_at
    ) values (
      p_kind,
      'queued',
      coalesce(p_payload, '{}'::jsonb),
      null,
      greatest(1, least(coalesce(p_max_attempts, 5), 10)),
      coalesce(p_available_at, now()),
      now()
    )
    returning background_jobs.id into v_id;

    return query select v_id, false;
    return;
  end if;

  -- Serialize admission for one logical dedupe identity. The unique partial
  -- index remains the integrity backstop for any writer outside this RPC.
  perform pg_advisory_xact_lock(
    hashtextextended(p_kind || chr(31) || p_dedupe_key, 0)
  );

  select jobs.id into v_id
  from public.background_jobs jobs
  where jobs.kind = p_kind
    and jobs.dedupe_key = p_dedupe_key
    and jobs.status in ('queued', 'running')
  order by jobs.created_at asc, jobs.id asc
  limit 1;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  -- ON CONFLICT is defensive against direct writers that do not use the
  -- advisory lock. Retry if such a conflicting row becomes terminal before
  -- we can observe it.
  for v_attempt in 1..5 loop
    v_id := null;

    insert into public.background_jobs (
      kind,
      status,
      payload,
      dedupe_key,
      max_attempts,
      available_at,
      updated_at
    ) values (
      p_kind,
      'queued',
      coalesce(p_payload, '{}'::jsonb),
      p_dedupe_key,
      greatest(1, least(coalesce(p_max_attempts, 5), 10)),
      coalesce(p_available_at, now()),
      now()
    )
    on conflict do nothing
    returning background_jobs.id into v_id;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;

    select jobs.id into v_id
    from public.background_jobs jobs
    where jobs.kind = p_kind
      and jobs.dedupe_key = p_dedupe_key
      and jobs.status in ('queued', 'running')
    order by jobs.created_at asc, jobs.id asc
    limit 1;

    if v_id is not null then
      return query select v_id, true;
      return;
    end if;
  end loop;

  raise exception 'Unable to admit background job after concurrent dedupe churn.';
end;
$$;

revoke all on function public.enqueue_background_job(text, jsonb, text, integer, timestamptz) from public;
revoke all on function public.enqueue_background_job(text, jsonb, text, integer, timestamptz) from anon;
revoke all on function public.enqueue_background_job(text, jsonb, text, integer, timestamptz) from authenticated;
grant execute on function public.enqueue_background_job(text, jsonb, text, integer, timestamptz) to service_role;

commit;

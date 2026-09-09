alter table public.analysis_recommendation_v3_review_requests
  add column if not exists next_attempt_at timestamptz;

update public.analysis_recommendation_v3_review_requests
set next_attempt_at = requested_at
where status = 'PENDING' and next_attempt_at is null;

create index if not exists analysis_recommendation_v3_review_requests_due_idx
  on public.analysis_recommendation_v3_review_requests (status, next_attempt_at, requested_at asc);

create or replace function public.claim_recommendation_v3_review_requests(
  p_limit integer default 10,
  p_now timestamptz default now(),
  p_lease_seconds integer default 900
)
returns setof public.analysis_recommendation_v3_review_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select request.id
    from public.analysis_recommendation_v3_review_requests request
    where (
      request.status = 'PENDING'
      and coalesce(request.next_attempt_at, request.requested_at) <= p_now
    ) or (
      request.status = 'PROCESSING'
      and request.claimed_at <= p_now - make_interval(secs => greatest(p_lease_seconds, 60))
    )
    order by
      case request.priority when 'urgent' then 0 when 'high' then 1 else 2 end,
      request.requested_at asc,
      request.id asc
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.analysis_recommendation_v3_review_requests request
  set
    status = 'PROCESSING',
    attempts = request.attempts + 1,
    claimed_at = p_now,
    completed_at = null,
    next_attempt_at = null,
    last_error = case
      when request.status = 'PROCESSING' then 'PROCESSING_LEASE_EXPIRED_RECLAIMED'
      else request.last_error
    end,
    updated_at = p_now
  from candidates
  where request.id = candidates.id
  returning request.*;
end;
$$;

create or replace function public.complete_recommendation_v3_review_request(
  p_id uuid,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.analysis_recommendation_v3_review_requests
  set
    status = 'COMPLETED',
    completed_at = p_now,
    next_attempt_at = null,
    last_error = null,
    updated_at = p_now
  where id = p_id and status = 'PROCESSING';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.retry_recommendation_v3_review_request(
  p_id uuid,
  p_error text,
  p_next_attempt_at timestamptz,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.analysis_recommendation_v3_review_requests
  set
    status = 'PENDING',
    claimed_at = null,
    completed_at = null,
    next_attempt_at = greatest(p_next_attempt_at, p_now),
    last_error = left(coalesce(nullif(btrim(p_error), ''), 'UNKNOWN_RECOMMENDATION_REVIEW_ERROR'), 1000),
    updated_at = p_now
  where id = p_id and status = 'PROCESSING';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.fail_recommendation_v3_review_request(
  p_id uuid,
  p_error text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.analysis_recommendation_v3_review_requests
  set
    status = 'FAILED',
    completed_at = null,
    next_attempt_at = null,
    last_error = left(coalesce(nullif(btrim(p_error), ''), 'UNKNOWN_RECOMMENDATION_REVIEW_ERROR'), 1000),
    updated_at = p_now
  where id = p_id and status = 'PROCESSING';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_recommendation_v3_review_requests(integer, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.complete_recommendation_v3_review_request(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.retry_recommendation_v3_review_request(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.fail_recommendation_v3_review_request(uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.claim_recommendation_v3_review_requests(integer, timestamptz, integer) to service_role;
grant execute on function public.complete_recommendation_v3_review_request(uuid, timestamptz) to service_role;
grant execute on function public.retry_recommendation_v3_review_request(uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.fail_recommendation_v3_review_request(uuid, text, timestamptz) to service_role;

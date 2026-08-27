create table if not exists public.rate_limit_buckets (
  key_hash text primary key,
  request_count integer not null check (request_count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_reset_at_idx
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_key_hash is null or length(p_key_hash) <> 64 then
    raise exception 'invalid rate-limit key';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate-limit policy';
  end if;

  delete from public.rate_limit_buckets
  where reset_at < p_now - interval '1 day';

  insert into public.rate_limit_buckets (key_hash, request_count, reset_at, updated_at)
  values (p_key_hash, 1, p_now + make_interval(secs => p_window_seconds), p_now)
  on conflict (key_hash) do update set
    request_count = case
      when public.rate_limit_buckets.reset_at <= p_now then 1
      else public.rate_limit_buckets.request_count + 1
    end,
    reset_at = case
      when public.rate_limit_buckets.reset_at <= p_now
        then p_now + make_interval(secs => p_window_seconds)
      else public.rate_limit_buckets.reset_at
    end,
    updated_at = p_now
  returning request_count, reset_at into v_count, v_reset_at;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_reset_at,
    'retry_after_seconds', case
      when v_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_reset_at - p_now)))::integer)
    end
  );
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, timestamptz)
  to service_role;

comment on table public.rate_limit_buckets is
  'Hashed request buckets for distributed application rate limiting.';
comment on function public.consume_rate_limit(text, integer, integer, timestamptz) is
  'Atomically consumes one request from a hashed rate-limit bucket. Service role only.';

-- Atomic service-role RPCs for the autonomous v3 render worker.
-- These functions are intentionally inaccessible to anon/authenticated roles.

create or replace function public.acq_claim_render_job_v3(p_worker_id text)
returns setof public.acq_render_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.acq_render_jobs%rowtype;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker_id_required';
  end if;

  select *
  into v_job
  from public.acq_render_jobs
  where state = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.acq_render_jobs
  set state = 'storyboarding',
      worker_id = p_worker_id,
      claimed_at = now(),
      attempt_count = attempt_count + 1,
      failure_reason = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

create or replace function public.acq_fail_render_job_v3(
  p_job_id uuid,
  p_worker_id text,
  p_reason text,
  p_retryable boolean,
  p_max_attempts integer
)
returns public.acq_render_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.acq_render_jobs%rowtype;
  v_next_state text;
begin
  if p_max_attempts < 1 then
    raise exception 'invalid_max_attempts';
  end if;

  select * into v_job
  from public.acq_render_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'render_job_not_found';
  end if;
  if v_job.state = 'ready' then
    return v_job;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    raise exception 'worker_mismatch';
  end if;

  v_next_state := case
    when p_retryable and v_job.attempt_count < p_max_attempts then 'queued'
    else 'failed'
  end;

  update public.acq_render_jobs
  set state = v_next_state,
      failure_reason = left(coalesce(p_reason, 'render_failed'), 1000),
      worker_id = case when v_next_state = 'queued' then null else worker_id end,
      claimed_at = case when v_next_state = 'queued' then null else claimed_at end,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.acq_complete_render_job_v3(
  p_job_id uuid,
  p_worker_id text,
  p_qc_summary jsonb,
  p_assets jsonb
)
returns public.acq_render_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.acq_render_jobs%rowtype;
  v_asset jsonb;
  v_master_count integer := 0;
  v_cover_count integer := 0;
  v_prefix text;
begin
  select * into v_job
  from public.acq_render_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'render_job_not_found';
  end if;
  if v_job.state = 'ready' then
    return v_job;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    raise exception 'worker_mismatch';
  end if;
  if coalesce((p_qc_summary ->> 'passed')::boolean, false) is not true then
    raise exception 'qc_must_pass';
  end if;
  if jsonb_typeof(p_assets) <> 'array' then
    raise exception 'assets_must_be_array';
  end if;

  v_prefix := to_char((v_job.created_at at time zone 'utc')::date, 'YYYY-MM-DD')
    || '/' || v_job.content_id::text || '/' || v_job.id::text || '/';

  for v_asset in select * from jsonb_array_elements(p_assets)
  loop
    if coalesce(v_asset ->> 'storage_path', '') not like v_prefix || '%' then
      raise exception 'asset_path_mismatch';
    end if;
    if coalesce(v_asset ->> 'checksum_sha256', '') !~ '^[A-Fa-f0-9]{64}$' then
      raise exception 'invalid_checksum';
    end if;
    if (v_asset ->> 'kind') not in ('master_video','cover','voice_audio','metadata') then
      raise exception 'unsupported_asset_kind';
    end if;
    if (v_asset ->> 'bucket') not in ('growth-render-staging','growth-ready-assets') then
      raise exception 'unsupported_asset_bucket';
    end if;

    if v_asset ->> 'kind' = 'master_video' then
      v_master_count := v_master_count + 1;
      if v_asset ->> 'bucket' <> 'growth-ready-assets' then
        raise exception 'master_video_must_be_ready_asset';
      end if;
    elsif v_asset ->> 'kind' = 'cover' then
      v_cover_count := v_cover_count + 1;
      if v_asset ->> 'bucket' <> 'growth-ready-assets' then
        raise exception 'cover_must_be_ready_asset';
      end if;
    end if;

    insert into public.acq_media_assets (
      idempotency_key,
      content_id,
      render_job_id,
      kind,
      bucket,
      storage_path,
      mime_type,
      width,
      height,
      duration_ms,
      checksum_sha256,
      qc_status,
      qc_summary,
      metadata
    ) values (
      v_job.id::text || ':' || (v_asset ->> 'kind'),
      v_job.content_id,
      v_job.id,
      v_asset ->> 'kind',
      v_asset ->> 'bucket',
      v_asset ->> 'storage_path',
      coalesce(v_asset ->> 'mime_type', 'application/octet-stream'),
      nullif(v_asset ->> 'width', '')::integer,
      nullif(v_asset ->> 'height', '')::integer,
      nullif(v_asset ->> 'duration_ms', '')::integer,
      v_asset ->> 'checksum_sha256',
      case when v_asset ->> 'kind' in ('master_video','cover') then 'passed' else 'not_required' end,
      p_qc_summary,
      coalesce(v_asset -> 'metadata', '{}'::jsonb)
    )
    on conflict (idempotency_key) do update set
      bucket = excluded.bucket,
      storage_path = excluded.storage_path,
      mime_type = excluded.mime_type,
      width = excluded.width,
      height = excluded.height,
      duration_ms = excluded.duration_ms,
      checksum_sha256 = excluded.checksum_sha256,
      qc_status = excluded.qc_status,
      qc_summary = excluded.qc_summary,
      metadata = excluded.metadata,
      updated_at = now();
  end loop;

  if v_master_count <> 1 or v_cover_count <> 1 then
    raise exception 'required_assets_missing_or_duplicated';
  end if;

  update public.acq_render_jobs
  set state = 'ready',
      completed_at = now(),
      failure_reason = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.acq_claim_render_job_v3(text) from public, anon, authenticated;
revoke all on function public.acq_fail_render_job_v3(uuid,text,text,boolean,integer) from public, anon, authenticated;
revoke all on function public.acq_complete_render_job_v3(uuid,text,jsonb,jsonb) from public, anon, authenticated;

grant execute on function public.acq_claim_render_job_v3(text) to service_role;
grant execute on function public.acq_fail_render_job_v3(uuid,text,text,boolean,integer) to service_role;
grant execute on function public.acq_complete_render_job_v3(uuid,text,jsonb,jsonb) to service_role;

-- Replace render completion with job-kind aware final-asset validation.

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
  v_prefix text;
  v_master_count integer := 0;
  v_cover_count integer := 0;
  v_slide_count integer := 0;
  v_zip_count integer := 0;
  v_static_count integer := 0;
  v_expected_slides integer := 0;
  v_kind text;
  v_bucket text;
  v_path text;
begin
  select * into v_job
  from public.acq_render_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'render_job_not_found'; end if;
  if v_job.state = 'ready' then return v_job; end if;
  if v_job.worker_id is distinct from p_worker_id then raise exception 'worker_mismatch'; end if;
  if coalesce((p_qc_summary ->> 'passed')::boolean, false) is not true then raise exception 'qc_must_pass'; end if;
  if jsonb_typeof(p_assets) <> 'array' then raise exception 'assets_must_be_array'; end if;

  v_prefix := to_char((v_job.created_at at time zone 'utc')::date, 'YYYY-MM-DD')
    || '/' || v_job.content_id::text || '/' || v_job.id::text || '/';

  if v_job.job_kind = 'carousel' and jsonb_typeof(v_job.render_spec -> 'slides') = 'array' then
    v_expected_slides := jsonb_array_length(v_job.render_spec -> 'slides');
  end if;

  for v_asset in select * from jsonb_array_elements(p_assets)
  loop
    v_kind := coalesce(v_asset ->> 'kind', '');
    v_bucket := coalesce(v_asset ->> 'bucket', '');
    v_path := coalesce(v_asset ->> 'storage_path', '');

    if v_path not like v_prefix || '%' then raise exception 'asset_path_mismatch'; end if;
    if coalesce(v_asset ->> 'checksum_sha256', '') !~ '^[A-Fa-f0-9]{64}$' then raise exception 'invalid_checksum'; end if;
    if v_bucket not in ('growth-render-staging','growth-ready-assets') then raise exception 'unsupported_asset_bucket'; end if;

    if v_job.job_kind = 'video' then
      if v_kind not in ('master_video','cover','voice_audio','metadata','generated_scene','screenshot') then
        raise exception 'unsupported_video_asset_kind';
      end if;
      if v_kind = 'master_video' then
        v_master_count := v_master_count + 1;
        if v_bucket <> 'growth-ready-assets' then raise exception 'master_video_must_be_ready_asset'; end if;
      elsif v_kind = 'cover' then
        v_cover_count := v_cover_count + 1;
        if v_bucket <> 'growth-ready-assets' then raise exception 'cover_must_be_ready_asset'; end if;
      end if;
    elsif v_job.job_kind = 'carousel' then
      if v_kind not in ('carousel_slide','carousel_zip','cover','metadata') then
        raise exception 'unsupported_carousel_asset_kind';
      end if;
      if v_bucket <> 'growth-ready-assets' then raise exception 'carousel_assets_must_be_ready'; end if;
      if v_kind = 'carousel_slide' then v_slide_count := v_slide_count + 1; end if;
      if v_kind = 'carousel_zip' then v_zip_count := v_zip_count + 1; end if;
      if v_kind = 'cover' then v_cover_count := v_cover_count + 1; end if;
    elsif v_job.job_kind = 'static_image' then
      if v_kind not in ('static_image','metadata') then raise exception 'unsupported_static_asset_kind'; end if;
      if v_bucket <> 'growth-ready-assets' then raise exception 'static_assets_must_be_ready'; end if;
      if v_kind = 'static_image' then v_static_count := v_static_count + 1; end if;
    else
      raise exception 'unsupported_job_kind';
    end if;

    insert into public.acq_media_assets (
      idempotency_key, content_id, render_job_id, kind, bucket, storage_path,
      mime_type, width, height, duration_ms, checksum_sha256, qc_status,
      qc_summary, metadata
    ) values (
      v_job.id::text || ':' || v_kind || ':' || v_path,
      v_job.content_id,
      v_job.id,
      v_kind,
      v_bucket,
      v_path,
      coalesce(v_asset ->> 'mime_type', 'application/octet-stream'),
      nullif(v_asset ->> 'width', '')::integer,
      nullif(v_asset ->> 'height', '')::integer,
      nullif(v_asset ->> 'duration_ms', '')::integer,
      v_asset ->> 'checksum_sha256',
      case
        when v_kind in ('master_video','cover','carousel_slide','carousel_zip','static_image') then 'passed'
        else 'not_required'
      end,
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

  if v_job.job_kind = 'video' and (v_master_count <> 1 or v_cover_count <> 1) then
    raise exception 'required_video_assets_missing_or_duplicated';
  end if;
  if v_job.job_kind = 'carousel' then
    if v_expected_slides < 3 or v_expected_slides > 8 then raise exception 'invalid_expected_carousel_slide_count'; end if;
    if v_slide_count <> v_expected_slides or v_zip_count <> 1 or v_cover_count <> 1 then
      raise exception 'required_carousel_assets_missing_or_duplicated';
    end if;
  end if;
  if v_job.job_kind = 'static_image' and v_static_count <> 1 then
    raise exception 'required_static_asset_missing_or_duplicated';
  end if;

  update public.acq_render_jobs
  set state = 'ready', completed_at = now(), failure_reason = null, updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.acq_complete_render_job_v3(uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.acq_complete_render_job_v3(uuid,text,jsonb,jsonb) to service_role;

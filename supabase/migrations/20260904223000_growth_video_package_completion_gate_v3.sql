-- Atomically materialize four platform-specific distribution packages when a v3 video render becomes ready.
-- The render completion transaction remains authoritative: if package persistence fails, the render state update rolls back.

create or replace function public.acq_sync_video_distribution_packages_v3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shadow boolean := true;
  v_master_asset_id uuid;
  v_cover_asset_id uuid;
  v_founder_voice_active boolean := false;
  v_budget_telemetry boolean := false;
  v_allowed boolean := false;
  v_reasons text[] := array[]::text[];
  v_platform text;
  v_title text;
  v_caption text;
  v_clean_caption text;
  v_copy text;
  v_url text;
  v_recommended_time text;
  v_daily_rank integer;
  v_source_queue_id text;
begin
  if new.job_kind <> 'video' or new.state <> 'ready' then
    return new;
  end if;

  select coalesce(lower(value) in ('true','1','yes','on'), true)
  into v_shadow
  from public.acq_config
  where key = 'growth_render_shadow_mode'
  limit 1;

  if not found then
    v_shadow := true;
  end if;

  select id
  into v_master_asset_id
  from public.acq_media_assets
  where render_job_id = new.id
    and kind = 'master_video'
    and bucket = 'growth-ready-assets'
    and qc_status = 'passed'
  order by created_at desc
  limit 1;

  select id
  into v_cover_asset_id
  from public.acq_media_assets
  where render_job_id = new.id
    and kind = 'cover'
    and bucket = 'growth-ready-assets'
    and qc_status = 'passed'
  order by created_at desc
  limit 1;

  if new.language = 'sv' then
    select exists(
      select 1
      from public.acq_voice_profiles
      where id = new.voice_profile_id
        and language = 'sv'
        and status = 'active'
    ) into v_founder_voice_active;
  else
    v_founder_voice_active := true;
  end if;

  select exists(
    select 1
    from public.acq_budget_ledger
    where render_job_id = new.id
  ) into v_budget_telemetry;

  if v_shadow then v_reasons := array_append(v_reasons, 'shadow_mode'); end if;
  if v_master_asset_id is null then v_reasons := array_append(v_reasons, 'master_video_not_ready'); end if;
  if v_cover_asset_id is null then v_reasons := array_append(v_reasons, 'cover_not_ready'); end if;
  if not v_founder_voice_active then v_reasons := array_append(v_reasons, 'founder_voice_not_active'); end if;
  if not v_budget_telemetry then v_reasons := array_append(v_reasons, 'budget_telemetry_missing'); end if;

  v_allowed := cardinality(v_reasons) = 0;
  v_title := nullif(btrim(coalesce(new.render_spec ->> 'title', '')), '');
  if v_title is null then v_title := 'StockBox'; end if;

  v_source_queue_id := nullif(new.metadata ->> 'source_queue_id', '');
  if v_source_queue_id is not null then
    select caption, recommended_time, daily_rank
    into v_caption, v_recommended_time, v_daily_rank
    from public.acq_distribution_queue
    where id::text = v_source_queue_id
    limit 1;
  end if;

  v_caption := coalesce(
    nullif(btrim(v_caption), ''),
    nullif(btrim(new.render_spec ->> 'script'), ''),
    v_title
  );

  -- Remove legacy/tracked URLs before appending exactly one v3 platform URL.
  v_clean_caption := regexp_replace(v_caption, 'https?://[^[:space:]]+', '', 'gi');
  v_clean_caption := regexp_replace(v_clean_caption, 'Testa[[:space:]]+StockBox[[:space:]]*:[[:space:]]*$', '', 'gi');
  v_clean_caption := btrim(regexp_replace(v_clean_caption, E'\n{3,}', E'\n\n', 'g'));
  if v_clean_caption = '' then v_clean_caption := v_title; end if;

  foreach v_platform in array array['instagram_reel','facebook_reel','tiktok','youtube_short']
  loop
    v_url := 'https://www.getstockbox.app/?utm_source=' || v_platform
      || '&utm_medium=organic_social&utm_campaign=auto_growth_v3&utm_content=' || new.content_id::text;

    v_copy := v_clean_caption;
    if v_platform = 'tiktok' then
      v_copy := v_copy || E'\n\n#aktier #börsen #aktieanalys';
    end if;
    v_copy := btrim(v_copy) || E'\n\nTesta StockBox: ' || v_url;

    insert into public.acq_distribution_packages (
      idempotency_key,
      content_id,
      render_job_id,
      master_asset_id,
      platform,
      title,
      caption,
      description,
      utm_url,
      recommended_time,
      status,
      daily_rank,
      metadata
    ) values (
      'v3:' || new.id::text || ':' || v_platform,
      new.content_id,
      new.id,
      v_master_asset_id,
      v_platform,
      case when v_platform = 'youtube_short' then v_title else null end,
      case when v_platform = 'youtube_short' then null else v_copy end,
      case when v_platform = 'youtube_short' then v_copy else null end,
      v_url,
      v_recommended_time,
      case when v_allowed then 'ready' else 'draft' end,
      v_daily_rank,
      jsonb_build_object(
        'master_reuse', true,
        'growth_v3', true,
        'promotion_allowed', v_allowed,
        'promotion_reasons', to_jsonb(v_reasons),
        'cover_asset_id', v_cover_asset_id
      )
    )
    on conflict (idempotency_key) do update set
      master_asset_id = excluded.master_asset_id,
      title = excluded.title,
      caption = excluded.caption,
      description = excluded.description,
      utm_url = excluded.utm_url,
      recommended_time = excluded.recommended_time,
      status = excluded.status,
      daily_rank = excluded.daily_rank,
      metadata = excluded.metadata,
      updated_at = now();
  end loop;

  return new;
end;
$$;

revoke all on function public.acq_sync_video_distribution_packages_v3() from public, anon, authenticated;

drop trigger if exists acq_render_ready_sync_video_packages_v3 on public.acq_render_jobs;
create trigger acq_render_ready_sync_video_packages_v3
after update of state on public.acq_render_jobs
for each row
when (new.state = 'ready' and old.state is distinct from new.state)
execute function public.acq_sync_video_distribution_packages_v3();

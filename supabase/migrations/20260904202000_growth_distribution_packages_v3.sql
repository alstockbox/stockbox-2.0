-- Build ready-to-post platform packages only after a render job reaches READY.
-- This trigger is additive and does not mutate the legacy v2 distribution queue.

create or replace function public.acq_build_distribution_packages_v3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue record;
  v_master_asset_id uuid;
  v_expected_asset_kind text;
begin
  if new.state <> 'ready' or old.state = 'ready' then
    return new;
  end if;

  v_expected_asset_kind := case new.job_kind
    when 'video' then 'master_video'
    when 'carousel' then 'cover'
    when 'static_image' then 'static_image'
    else null
  end;

  if v_expected_asset_kind is null then
    return new;
  end if;

  select a.id
  into v_master_asset_id
  from public.acq_media_assets a
  where a.render_job_id = new.id
    and a.kind = v_expected_asset_kind
    and a.qc_status = 'passed'
  order by a.created_at asc
  limit 1;

  if v_master_asset_id is null then
    raise exception 'ready_render_missing_primary_asset';
  end if;

  for v_queue in
    select
      q.id,
      q.platform,
      q.caption,
      q.script,
      q.utm_url,
      q.recommended_time,
      q.daily_rank
    from public.acq_distribution_queue q
    where q.content_id = new.content_id
      and q.status = 'pending_approval'
      and (
        (new.job_kind = 'video' and q.platform in ('instagram_reel','facebook_reel','tiktok','youtube_short'))
        or (new.job_kind = 'carousel' and q.platform = 'instagram_carousel')
        or (new.job_kind = 'static_image' and q.platform in ('linkedin','facebook'))
      )
  loop
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
      'package:v3:' || new.id::text || ':' || v_queue.platform,
      new.content_id,
      new.id,
      v_master_asset_id,
      v_queue.platform,
      nullif(split_part(coalesce(v_queue.caption, ''), E'\n', 1), ''),
      v_queue.caption,
      case when v_queue.platform = 'youtube_short' then v_queue.script else null end,
      v_queue.utm_url,
      v_queue.recommended_time,
      'ready',
      v_queue.daily_rank,
      jsonb_build_object('source_queue_id', v_queue.id, 'job_kind', new.job_kind)
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

revoke all on function public.acq_build_distribution_packages_v3() from public, anon, authenticated;
grant execute on function public.acq_build_distribution_packages_v3() to service_role;

drop trigger if exists acq_render_jobs_build_packages_v3 on public.acq_render_jobs;
create trigger acq_render_jobs_build_packages_v3
after update of state on public.acq_render_jobs
for each row
when (new.state = 'ready' and old.state is distinct from new.state)
execute function public.acq_build_distribution_packages_v3();

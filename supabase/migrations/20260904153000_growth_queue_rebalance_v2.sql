create or replace function public.rebalance_acq_distribution_queue_v2()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := 6;
  v_min_quality numeric := 72;
  v_content_count integer := 0;
  v_selected integer := 0;
begin
  select coalesce((select value::integer from acq_config where key = 'engine_daily_queue_limit' limit 1), 6)
    into v_limit;
  select coalesce((select value::numeric from acq_config where key = 'engine_min_quality_score' limit 1), 72)
    into v_min_quality;

  select count(distinct content_id)
    into v_content_count
  from acq_distribution_queue
  where generation_version = 'v2'
    and status in ('pending_approval','deferred')
    and coalesce(quality_score, 0) >= v_min_quality
    and content_id is not null;

  if v_content_count = 0 then
    return 0;
  end if;

  update acq_distribution_queue
     set status = 'deferred', daily_rank = null, updated_at = now()
   where generation_version = 'v2'
     and status in ('pending_approval','deferred');

  with eligible as (
    select id, platform, content_id, coalesce(quality_score,0) as quality_score, created_at
    from acq_distribution_queue
    where generation_version = 'v2'
      and status = 'deferred'
      and coalesce(quality_score,0) >= v_min_quality
      and content_id is not null
  ),
  content_scores as (
    select content_id, max(quality_score) as best_quality, max(created_at) as latest_created
    from eligible
    group by content_id
  ),
  ranked_contents as (
    select content_id,
           row_number() over (order by best_quality desc, latest_created desc, content_id) as content_rank
    from content_scores
  ),
  platform_slots(platform, slot_no) as (
    values
      ('tiktok'::text,1),
      ('instagram_reel'::text,2),
      ('instagram_carousel'::text,3),
      ('youtube_short'::text,4),
      ('linkedin'::text,5),
      ('facebook'::text,6)
  ),
  desired as (
    select ps.platform, ps.slot_no, rc.content_id
    from platform_slots ps
    join ranked_contents rc
      on rc.content_rank = ((ps.slot_no - 1) % v_content_count) + 1
    where ps.slot_no <= v_limit
  ),
  choices as (
    select e.id, d.slot_no,
           row_number() over (partition by d.slot_no order by e.quality_score desc, e.created_at desc, e.id) as pick_no
    from desired d
    join eligible e
      on e.platform = d.platform
     and e.content_id = d.content_id
  ),
  picked as (
    select id, slot_no
    from choices
    where pick_no = 1
  )
  update acq_distribution_queue q
     set status = 'pending_approval', daily_rank = p.slot_no, updated_at = now()
    from picked p
   where q.id = p.id;

  get diagnostics v_selected = row_count;
  return v_selected;
end;
$$;

create or replace function public.trg_rebalance_acq_distribution_queue_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.generation_version = 'v2'
     and new.status in ('pending_approval','deferred') then
    perform public.rebalance_acq_distribution_queue_v2();
  end if;
  return new;
end;
$$;

drop trigger if exists acq_distribution_queue_v2_rebalance_on_insert on public.acq_distribution_queue;
create trigger acq_distribution_queue_v2_rebalance_on_insert
after insert on public.acq_distribution_queue
for each row
execute function public.trg_rebalance_acq_distribution_queue_v2();

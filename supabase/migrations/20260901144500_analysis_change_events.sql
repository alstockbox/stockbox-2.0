begin;

create table if not exists public.analysis_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  previous_analysis_id uuid references public.analyses(id) on delete set null,
  change_kind text not null,
  severity text not null check (severity in ('info', 'watch', 'important')),
  direction text not null check (direction in ('supports', 'weakens', 'neutral')),
  title text not null,
  body text not null,
  metric text,
  before_value numeric,
  after_value numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists analysis_change_events_dedupe_idx
  on public.analysis_change_events (
    analysis_id,
    change_kind,
    coalesce(metric, ''),
    title
  );

create index if not exists analysis_change_events_user_ticker_idx
  on public.analysis_change_events (user_id, ticker, created_at desc);

alter table public.analysis_change_events enable row level security;
drop policy if exists analysis_change_events_select_own on public.analysis_change_events;
create policy analysis_change_events_select_own on public.analysis_change_events
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function private.stockbox_recommendation_rank(p_rating text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_rating
    when 'Strong Sell' then 0
    when 'Sell' then 1
    when 'Hold' then 2
    when 'No Rating' then 2
    when 'Buy' then 3
    when 'Strong Buy' then 4
    else 2
  end;
$$;

create or replace function private.stockbox_report_metric(p_report jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text;
begin
  v_value := p_report -> 'metrics' ->> p_key;
  if v_value is null or v_value = '' then return null; end if;
  return v_value::numeric;
exception when others then
  return null;
end;
$$;

create or replace function private.capture_stockbox_analysis_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.analyses%rowtype;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_rank_delta integer;
  v_thesis_id uuid;
  v_thesis_status text;
begin
  if new.user_id is null then return new; end if;

  select * into v_previous
  from public.analyses
  where user_id = new.user_id
    and ticker = new.ticker
    and id <> new.id
  order by created_at desc
  limit 1;

  if not found then return new; end if;

  if v_previous.recommendation is distinct from new.recommendation then
    v_rank_delta := private.stockbox_recommendation_rank(new.recommendation)
      - private.stockbox_recommendation_rank(v_previous.recommendation);
    insert into public.analysis_change_events (
      user_id, ticker, analysis_id, previous_analysis_id, change_kind,
      severity, direction, title, body, metadata
    ) values (
      new.user_id, new.ticker, new.id, v_previous.id, 'rating_changed',
      case when abs(v_rank_delta) >= 2 then 'important' else 'watch' end,
      case when v_rank_delta > 0 then 'supports' when v_rank_delta < 0 then 'weakens' else 'neutral' end,
      'Model rating changed',
      'Model rating changed from ' || v_previous.recommendation || ' to ' || new.recommendation || '.',
      jsonb_build_object('before', v_previous.recommendation, 'after', new.recommendation)
    );
  end if;

  if v_previous.score is not null and new.score is not null and abs(new.score - v_previous.score) >= 5 then
    v_delta := new.score - v_previous.score;
    insert into public.analysis_change_events (
      user_id, ticker, analysis_id, previous_analysis_id, change_kind,
      severity, direction, title, body, metric, before_value, after_value, metadata
    ) values (
      new.user_id, new.ticker, new.id, v_previous.id, 'score_changed',
      case when abs(v_delta) >= 12 then 'important' else 'watch' end,
      case when v_delta > 0 then 'supports' else 'weakens' end,
      'StockBox Score changed materially',
      'StockBox Score moved from ' || round(v_previous.score, 2)::text || ' to ' || round(new.score, 2)::text || '.',
      'stockBoxScore', v_previous.score, new.score, jsonb_build_object('delta', v_delta)
    );
  end if;

  if v_previous.personalized_score is not null and new.personalized_score is not null
     and abs(new.personalized_score - v_previous.personalized_score) >= 5 then
    v_delta := new.personalized_score - v_previous.personalized_score;
    insert into public.analysis_change_events (
      user_id, ticker, analysis_id, previous_analysis_id, change_kind,
      severity, direction, title, body, metric, before_value, after_value, metadata
    ) values (
      new.user_id, new.ticker, new.id, v_previous.id, 'personalized_score_changed',
      case when abs(v_delta) >= 12 then 'important' else 'watch' end,
      case when v_delta > 0 then 'supports' else 'weakens' end,
      'Profile-weighted score changed materially',
      'Profile-weighted score moved from ' || round(v_previous.personalized_score, 2)::text || ' to ' || round(new.personalized_score, 2)::text || '.',
      'personalizedScore', v_previous.personalized_score, new.personalized_score, jsonb_build_object('delta', v_delta)
    );
  end if;

  if v_previous.confidence is not null and new.confidence is not null
     and abs(new.confidence - v_previous.confidence) >= 10 then
    v_delta := new.confidence - v_previous.confidence;
    insert into public.analysis_change_events (
      user_id, ticker, analysis_id, previous_analysis_id, change_kind,
      severity, direction, title, body, metric, before_value, after_value, metadata
    ) values (
      new.user_id, new.ticker, new.id, v_previous.id, 'confidence_changed',
      case when abs(v_delta) >= 25 then 'important' else 'watch' end,
      case when v_delta > 0 then 'supports' else 'weakens' end,
      'Confidence changed materially',
      'Confidence moved from ' || round(v_previous.confidence, 2)::text || ' to ' || round(new.confidence, 2)::text || '.',
      'confidence', v_previous.confidence, new.confidence, jsonb_build_object('delta', v_delta)
    );
  end if;

  if v_previous.data_coverage is not null and new.data_coverage is not null
     and abs(new.data_coverage - v_previous.data_coverage) >= 0.10 then
    v_delta := new.data_coverage - v_previous.data_coverage;
    insert into public.analysis_change_events (
      user_id, ticker, analysis_id, previous_analysis_id, change_kind,
      severity, direction, title, body, metric, before_value, after_value, metadata
    ) values (
      new.user_id, new.ticker, new.id, v_previous.id, 'coverage_changed',
      case when abs(v_delta) >= 0.25 then 'important' else 'watch' end,
      case when v_delta > 0 then 'supports' else 'weakens' end,
      'Data coverage changed materially',
      'Data coverage moved from ' || round(v_previous.data_coverage, 3)::text || ' to ' || round(new.data_coverage, 3)::text || '.',
      'dataCoverage', v_previous.data_coverage, new.data_coverage, jsonb_build_object('delta', v_delta)
    );
  end if;

  v_before := private.stockbox_report_metric(v_previous.report, 'revenueGrowth1y');
  v_after := private.stockbox_report_metric(new.report, 'revenueGrowth1y');
  if v_before is not null and v_after is not null and abs(v_after - v_before) >= 0.05 then
    v_delta := v_after - v_before;
    insert into public.analysis_change_events (user_id,ticker,analysis_id,previous_analysis_id,change_kind,severity,direction,title,body,metric,before_value,after_value,metadata)
    values (new.user_id,new.ticker,new.id,v_previous.id,'metric_changed',case when abs(v_delta)>=0.15 then 'important' else 'watch' end,case when v_delta>0 then 'supports' else 'weakens' end,'Revenue growth changed materially','Revenue growth moved from '||round(v_before,3)::text||' to '||round(v_after,3)::text||'.','revenueGrowth1y',v_before,v_after,jsonb_build_object('delta',v_delta));
  end if;

  v_before := private.stockbox_report_metric(v_previous.report, 'operatingMargin');
  v_after := private.stockbox_report_metric(new.report, 'operatingMargin');
  if v_before is not null and v_after is not null and abs(v_after - v_before) >= 0.03 then
    v_delta := v_after - v_before;
    insert into public.analysis_change_events (user_id,ticker,analysis_id,previous_analysis_id,change_kind,severity,direction,title,body,metric,before_value,after_value,metadata)
    values (new.user_id,new.ticker,new.id,v_previous.id,'metric_changed',case when abs(v_delta)>=0.08 then 'important' else 'watch' end,case when v_delta>0 then 'supports' else 'weakens' end,'Operating margin changed materially','Operating margin moved from '||round(v_before,3)::text||' to '||round(v_after,3)::text||'.','operatingMargin',v_before,v_after,jsonb_build_object('delta',v_delta));
  end if;

  v_before := private.stockbox_report_metric(v_previous.report, 'fcfMargin');
  v_after := private.stockbox_report_metric(new.report, 'fcfMargin');
  if v_before is not null and v_after is not null and abs(v_after - v_before) >= 0.03 then
    v_delta := v_after - v_before;
    insert into public.analysis_change_events (user_id,ticker,analysis_id,previous_analysis_id,change_kind,severity,direction,title,body,metric,before_value,after_value,metadata)
    values (new.user_id,new.ticker,new.id,v_previous.id,'metric_changed',case when abs(v_delta)>=0.08 then 'important' else 'watch' end,case when v_delta>0 then 'supports' else 'weakens' end,'Free-cash-flow margin changed materially','FCF margin moved from '||round(v_before,3)::text||' to '||round(v_after,3)::text||'.','fcfMargin',v_before,v_after,jsonb_build_object('delta',v_delta));
  end if;

  v_before := private.stockbox_report_metric(v_previous.report, 'debtToEquity');
  v_after := private.stockbox_report_metric(new.report, 'debtToEquity');
  if v_before is not null and v_after is not null and abs(v_after - v_before) >= 0.25 then
    v_delta := v_after - v_before;
    insert into public.analysis_change_events (user_id,ticker,analysis_id,previous_analysis_id,change_kind,severity,direction,title,body,metric,before_value,after_value,metadata)
    values (new.user_id,new.ticker,new.id,v_previous.id,'metric_changed',case when abs(v_delta)>=0.75 then 'important' else 'watch' end,case when v_delta<0 then 'supports' else 'weakens' end,'Debt to equity changed materially','Debt to equity moved from '||round(v_before,3)::text||' to '||round(v_after,3)::text||'.','debtToEquity',v_before,v_after,jsonb_build_object('delta',v_delta));
  end if;

  insert into public.analysis_change_events (
    user_id, ticker, analysis_id, previous_analysis_id, change_kind,
    severity, direction, title, body, metric, metadata
  )
  select
    new.user_id, new.ticker, new.id, v_previous.id, 'red_flag_added',
    case when lower(coalesce(flag->>'severity','')) in ('high','critical') then 'important' else 'watch' end,
    'weakens',
    'New red flag: ' || coalesce(flag->>'title','Unknown flag'),
    coalesce(flag->>'detail','A new deterministic red flag appeared.'),
    flag->>'metric',
    jsonb_build_object('flagSeverity', flag->>'severity')
  from jsonb_array_elements(coalesce(new.report->'redFlags','[]'::jsonb)) as flag
  where flag->>'title' is not null
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_previous.report->'redFlags','[]'::jsonb)) as previous_flag
      where previous_flag->>'title' = flag->>'title'
    );

  insert into public.analysis_change_events (
    user_id, ticker, analysis_id, previous_analysis_id, change_kind,
    severity, direction, title, body, metric, metadata
  )
  select
    new.user_id, new.ticker, new.id, v_previous.id, 'red_flag_removed',
    case when lower(coalesce(flag->>'severity','')) in ('high','critical') then 'watch' else 'info' end,
    'supports',
    'Red flag cleared: ' || coalesce(flag->>'title','Unknown flag'),
    coalesce(flag->>'detail','A previous deterministic red flag is no longer present.'),
    flag->>'metric',
    jsonb_build_object('flagSeverity', flag->>'severity')
  from jsonb_array_elements(coalesce(v_previous.report->'redFlags','[]'::jsonb)) as flag
  where flag->>'title' is not null
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.report->'redFlags','[]'::jsonb)) as current_flag
      where current_flag->>'title' = flag->>'title'
    );

  select id, status into v_thesis_id, v_thesis_status
  from public.investment_theses
  where user_id = new.user_id
    and ticker = new.ticker
    and status in ('draft','active')
  limit 1;

  if v_thesis_id is not null then
    insert into public.thesis_evidence_events (
      thesis_id, user_id, analysis_id, event_kind, title, body, evidence
    )
    select
      v_thesis_id,
      new.user_id,
      new.id,
      direction,
      case when direction = 'weakens' and severity = 'important'
        then 'Review invalidation triggers — ' || title
        else title end,
      body,
      jsonb_build_object(
        'changeKind', change_kind,
        'severity', severity,
        'metric', metric,
        'beforeValue', before_value,
        'afterValue', after_value
      )
    from public.analysis_change_events
    where analysis_id = new.id and severity <> 'info'
    order by created_at asc
    limit 12;

    update public.investment_theses
    set last_analysis_id = new.id
    where id = v_thesis_id and user_id = new.user_id;

    if v_thesis_status = 'active' and exists (
      select 1 from public.analysis_change_events
      where analysis_id = new.id and severity = 'important' and direction = 'weakens'
    ) then
      insert into public.notifications (user_id, kind, title, body, metadata)
      values (
        new.user_id,
        'thesis_review',
        'Review thesis for ' || new.ticker,
        'Material weakening evidence changed since the previous saved analysis.',
        jsonb_build_object('ticker', new.ticker, 'thesisId', v_thesis_id, 'analysisId', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists analyses_capture_stockbox_changes on public.analyses;
create trigger analyses_capture_stockbox_changes
after insert on public.analyses
for each row execute function private.capture_stockbox_analysis_changes();

commit;

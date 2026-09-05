begin;

create table if not exists public.stockbox_alert_state_v3 (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null check (char_length(ticker) between 1 and 32),
  source_analysis_id text not null,
  rating text not null check (rating in ('STRONG_BUY','BUY','WAIT','HOLD','REDUCE','SELL','UNAVAILABLE')),
  objective_score numeric check (objective_score is null or (objective_score >= 0 and objective_score <= 100)),
  conviction numeric not null check (conviction >= 0 and conviction <= 100),
  data_quality numeric not null check (data_quality >= 0 and data_quality <= 100),
  price numeric check (price is null or price >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  observed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create index if not exists stockbox_alert_state_v3_observed_idx
  on public.stockbox_alert_state_v3 (observed_at desc);

alter table public.stockbox_alert_state_v3 enable row level security;

-- State is an internal derived fact used to compare consecutive objective
-- StockBox analyses. Browser roles never write or read this control state.
revoke all on table public.stockbox_alert_state_v3 from public, anon, authenticated;
grant select, insert, update, delete on table public.stockbox_alert_state_v3 to service_role;

create or replace function public.commit_stockbox_alert_snapshot_v3(
  p_user_id uuid,
  p_ticker text,
  p_expected_previous_analysis_id text,
  p_snapshot jsonb,
  p_events jsonb default '[]'::jsonb,
  p_watchlist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticker text := upper(trim(p_ticker));
  v_previous_analysis_id text;
  v_previous_observed_at timestamptz;
  v_found boolean := false;
  v_source_analysis_id text;
  v_rating text;
  v_objective_score numeric;
  v_conviction numeric;
  v_data_quality numeric;
  v_price numeric;
  v_currency text;
  v_observed_at timestamptz;
  v_inserted_events integer := 0;
begin
  if p_user_id is null or v_ticker is null or char_length(v_ticker) < 1 or char_length(v_ticker) > 32 then
    raise exception 'Invalid alert snapshot identity';
  end if;
  if jsonb_typeof(p_snapshot) <> 'object' or jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid alert snapshot payload';
  end if;

  v_source_analysis_id := nullif(trim(p_snapshot->>'analysisId'), '');
  v_rating := nullif(trim(p_snapshot->>'rating'), '');
  v_objective_score := nullif(p_snapshot->>'objectiveScore', '')::numeric;
  v_conviction := nullif(p_snapshot->>'conviction', '')::numeric;
  v_data_quality := nullif(p_snapshot->>'dataQuality', '')::numeric;
  v_price := nullif(p_snapshot->>'price', '')::numeric;
  v_currency := nullif(upper(trim(p_snapshot->>'currency')), '');
  v_observed_at := nullif(p_snapshot->>'observedAt', '')::timestamptz;

  if v_source_analysis_id is null or v_rating not in ('STRONG_BUY','BUY','WAIT','HOLD','REDUCE','SELL','UNAVAILABLE') then
    raise exception 'Invalid alert snapshot state';
  end if;
  if v_conviction is null or v_conviction < 0 or v_conviction > 100
     or v_data_quality is null or v_data_quality < 0 or v_data_quality > 100
     or (v_objective_score is not null and (v_objective_score < 0 or v_objective_score > 100))
     or (v_price is not null and v_price < 0)
     or (v_currency is not null and v_currency !~ '^[A-Z]{3}$')
     or v_observed_at is null then
    raise exception 'Invalid alert snapshot values';
  end if;

  if p_watchlist_id is not null and not exists (
    select 1
    from public.watchlists w
    where w.id = p_watchlist_id
      and w.user_id = p_user_id
      and upper(w.ticker) = v_ticker
  ) then
    raise exception 'Watchlist identity mismatch';
  end if;

  select s.source_analysis_id, s.observed_at
    into v_previous_analysis_id, v_previous_observed_at
  from public.stockbox_alert_state_v3 s
  where s.user_id = p_user_id and s.ticker = v_ticker
  for update;
  v_found := found;

  if v_found then
    if v_previous_analysis_id is distinct from p_expected_previous_analysis_id then
      return jsonb_build_object('committed', false, 'conflict', true, 'stale', false);
    end if;
    if v_previous_observed_at > v_observed_at then
      return jsonb_build_object('committed', false, 'conflict', false, 'stale', true);
    end if;
  elsif p_expected_previous_analysis_id is not null then
    return jsonb_build_object('committed', false, 'conflict', true, 'stale', false);
  end if;

  insert into public.stockbox_alert_events_v3 (
    user_id,
    watchlist_id,
    ticker,
    alert_kind,
    severity,
    policy_version,
    dedupe_key,
    source_analysis_id,
    message_key,
    payload,
    observed_at
  )
  select
    p_user_id,
    p_watchlist_id,
    v_ticker,
    event_item->>'kind',
    event_item->>'severity',
    event_item->>'policyVersion',
    event_item->>'dedupeKey',
    v_source_analysis_id,
    event_item->>'messageKey',
    coalesce(event_item->'payload', '{}'::jsonb),
    v_observed_at
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as event_item
  where event_item->>'kind' in ('RECOMMENDATION_CHANGE','CONVICTION_DROP','DATA_QUALITY_DROP','PRICE_ABOVE','PRICE_BELOW')
    and event_item->>'severity' in ('info','watch','important')
    and nullif(event_item->>'policyVersion', '') is not null
    and nullif(event_item->>'dedupeKey', '') is not null
    and nullif(event_item->>'messageKey', '') is not null
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_inserted_events = row_count;

  insert into public.stockbox_alert_state_v3 (
    user_id,
    ticker,
    source_analysis_id,
    rating,
    objective_score,
    conviction,
    data_quality,
    price,
    currency,
    observed_at,
    updated_at
  ) values (
    p_user_id,
    v_ticker,
    v_source_analysis_id,
    v_rating,
    v_objective_score,
    v_conviction,
    v_data_quality,
    v_price,
    v_currency,
    v_observed_at,
    now()
  )
  on conflict (user_id, ticker) do update
  set source_analysis_id = excluded.source_analysis_id,
      rating = excluded.rating,
      objective_score = excluded.objective_score,
      conviction = excluded.conviction,
      data_quality = excluded.data_quality,
      price = excluded.price,
      currency = excluded.currency,
      observed_at = excluded.observed_at,
      updated_at = now();

  return jsonb_build_object(
    'committed', true,
    'conflict', false,
    'stale', false,
    'insertedEvents', v_inserted_events
  );
end;
$$;

revoke all on function public.commit_stockbox_alert_snapshot_v3(uuid,text,text,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.commit_stockbox_alert_snapshot_v3(uuid,text,text,jsonb,jsonb,uuid) to service_role;

comment on function public.commit_stockbox_alert_snapshot_v3(uuid,text,text,jsonb,jsonb,uuid) is
  'Service-role-only optimistic commit for StockBox 3 objective alert state and deduplicated events.';

commit;

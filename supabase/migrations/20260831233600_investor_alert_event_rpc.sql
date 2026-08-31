begin;

create or replace function public.record_investment_alert_event(
  p_user_id uuid,
  p_alert_id uuid,
  p_snapshot_id uuid,
  p_event_key text,
  p_ticker text,
  p_company_name text,
  p_kind text,
  p_metric_key text,
  p_prior_value numeric,
  p_trigger_value numeric,
  p_threshold numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_notification_id uuid;
begin
  if not exists (
    select 1 from public.user_alerts
    where id = p_alert_id and user_id = p_user_id and enabled = true and ticker = p_ticker
  ) then
    raise exception 'active owned alert required';
  end if;

  if p_snapshot_id is not null and not exists (
    select 1 from public.company_metric_snapshots
    where id = p_snapshot_id and user_id = p_user_id and ticker = p_ticker
  ) then
    raise exception 'owned snapshot required';
  end if;

  insert into public.alert_events (
    user_id, alert_id, snapshot_id, event_key, metric_key,
    prior_value, trigger_value, threshold, payload
  ) values (
    p_user_id, p_alert_id, p_snapshot_id, p_event_key, p_metric_key,
    p_prior_value, p_trigger_value, p_threshold,
    jsonb_build_object(
      'ticker', p_ticker,
      'companyName', p_company_name,
      'kind', p_kind,
      'reason', p_reason
    )
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('inserted', false, 'reason', 'duplicate_event');
  end if;

  insert into public.notifications (user_id, kind, title, body, metadata)
  values (
    p_user_id,
    'investment_alert',
    p_ticker || ' · ' || p_kind,
    p_reason,
    jsonb_build_object(
      'alertEventId', v_event_id,
      'alertId', p_alert_id,
      'snapshotId', p_snapshot_id,
      'ticker', p_ticker,
      'metricKey', p_metric_key,
      'priorValue', p_prior_value,
      'triggerValue', p_trigger_value,
      'threshold', p_threshold
    )
  )
  returning id into v_notification_id;

  return jsonb_build_object(
    'inserted', true,
    'eventId', v_event_id,
    'notificationId', v_notification_id
  );
end;
$$;

revoke all on function public.record_investment_alert_event(
  uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, numeric, text
) from public, anon, authenticated;
grant execute on function public.record_investment_alert_event(
  uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, numeric, text
) to service_role;

commit;

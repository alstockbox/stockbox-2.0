begin;

update public.plans
set entitlements = jsonb_set(
  jsonb_set(entitlements, '{aiAssistant}', 'false'::jsonb, true),
  '{hourlyAlerts}', 'false'::jsonb, true
),
updated_at = now()
where key in ('standard', 'premium', 'elite');

commit;

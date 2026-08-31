begin;

-- Align the production plan row with the approved Pro allowance.
update public.plans
set entitlements = jsonb_set(
      coalesce(entitlements, '{}'::jsonb),
      '{monthlyAnalyses}',
      '70'::jsonb,
      true
    ),
    updated_at = now()
where key = 'premium';

-- Keep one global payout floor: SEK 100 = 10,000 öre.
alter table public.affiliates
  alter column payout_minimum_cents set default 10000;

update public.affiliates
set payout_minimum_cents = 10000,
    updated_at = now()
where payout_minimum_cents is distinct from 10000;
create or replace function private.workspace_entitlements(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_role text := 'customer';
  v_profile_created_at timestamptz;
  v_plan_key text := 'free';
  v_entitlements jsonb;
  v_ambassador public.ambassador_entitlements%rowtype;
begin
  select coalesce(role, 'customer'), created_at
  into v_role, v_profile_created_at
  from public.profiles
  where id = p_user_id;

  if not found then
    return jsonb_build_object(
      'plan', 'free',
      'entitlements', '{}'::jsonb
    );
  end if;
  if v_role = 'admin' then
    select entitlements into v_entitlements
    from public.plans where key = 'elite';
    v_entitlements := jsonb_set(
      jsonb_set(
        coalesce(v_entitlements, '{}'::jsonb),
        '{monthlyAnalyses}', '2147483647'::jsonb
      ),
      '{deepAnalyses}', '2147483647'::jsonb
    );
    return jsonb_build_object(
      'plan', 'elite',
      'entitlements', v_entitlements
    );
  end if;

  if v_role = 'affiliate_ambassador' then
    select * into v_ambassador
    from public.ambassador_entitlements
    where user_id = p_user_id;
    if not found then
      return jsonb_build_object(
        'plan', 'affiliate_ambassador',
        'configured', false,
        'entitlements', jsonb_build_object(
          'monthlyAnalyses', 0,
          'deepAnalyses', 0,
          'watchlistItems', 0,
          'batchRows', 0,
          'portfolios', 0,
          'aiAssistant', false,
          'hourlyAlerts', false
        )
      );
    end if;
    return jsonb_build_object(
      'plan', 'affiliate_ambassador',
      'configured', true,
      'entitlements', jsonb_build_object(
        'monthlyAnalyses', v_ambassador.monthly_analyses,
        'deepAnalyses', v_ambassador.deep_analyses,
        'watchlistItems', v_ambassador.watchlist_items,
        'batchRows', v_ambassador.batch_rows,
        'portfolios', v_ambassador.portfolios,
        'aiAssistant', false,
        'hourlyAlerts', false
      )
    );
  end if;

  v_plan_key := private.stockbox_effective_plan(p_user_id);
  select entitlements into v_entitlements
  from public.plans
  where key = v_plan_key and active = true;

  if v_entitlements is null then
    v_plan_key := 'free';
    select entitlements into v_entitlements
    from public.plans where key = 'free';
  end if;
  if v_plan_key = 'free'
     and v_profile_created_at is not null
     and now() < v_profile_created_at + interval '30 days' then
    v_entitlements := jsonb_set(
      coalesce(v_entitlements, '{}'::jsonb),
      '{monthlyAnalyses}', '5'::jsonb,
      true
    );
  end if;

  return jsonb_build_object(
    'plan', v_plan_key,
    'entitlements', coalesce(v_entitlements, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.workspace_entitlements(uuid)
  from public, anon, authenticated;

commit;

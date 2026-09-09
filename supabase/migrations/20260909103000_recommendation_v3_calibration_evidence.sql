begin;

create table if not exists public.analysis_recommendation_v3_calibration_evidence (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.analysis_recommendation_v3_calibration_candidates(id) on delete restrict,
  evidence_kind text not null check (evidence_kind in ('BACKTEST', 'SHADOW')),
  observed_at timestamptz not null,
  analysis_archetype text not null check (btrim(analysis_archetype) <> ''),
  model_version text not null check (btrim(model_version) <> ''),
  recommendation_policy_version text not null check (btrim(recommendation_policy_version) <> ''),
  variant_fingerprint text not null check (btrim(variant_fingerprint) <> ''),
  dataset_fingerprint text not null check (btrim(dataset_fingerprint) <> ''),
  frozen_dataset boolean,
  unseen_sample boolean,
  user_visible boolean not null default false,
  sample_size integer not null check (sample_size >= 30),
  benchmark_sample_size integer not null check (benchmark_sample_size >= 30 and benchmark_sample_size <= sample_size),
  baseline_sample_size integer not null check (baseline_sample_size >= 30),
  baseline_benchmark_sample_size integer not null check (
    baseline_benchmark_sample_size >= 30 and baseline_benchmark_sample_size <= baseline_sample_size
  ),
  baseline_hit_rate numeric check (baseline_hit_rate is null or (baseline_hit_rate >= 0 and baseline_hit_rate <= 1)),
  variant_hit_rate numeric check (variant_hit_rate is null or (variant_hit_rate >= 0 and variant_hit_rate <= 1)),
  baseline_mean_excess_return numeric,
  variant_mean_excess_return numeric,
  baseline_integrity_failure_rate numeric not null check (
    baseline_integrity_failure_rate >= 0 and baseline_integrity_failure_rate <= 1
  ),
  variant_integrity_failure_rate numeric not null check (
    variant_integrity_failure_rate >= 0 and variant_integrity_failure_rate <= 0.02
  ),
  variant_safety_incident_count integer not null check (variant_safety_incident_count = 0),
  reason_codes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint analysis_recommendation_v3_calibration_evidence_same_sample check (
    sample_size = baseline_sample_size
    and benchmark_sample_size = baseline_benchmark_sample_size
  ),
  constraint analysis_recommendation_v3_calibration_evidence_integrity check (
    variant_integrity_failure_rate <= baseline_integrity_failure_rate
  ),
  constraint analysis_recommendation_v3_calibration_evidence_hit_regression check (
    baseline_hit_rate is null
    or variant_hit_rate is null
    or variant_hit_rate >= baseline_hit_rate - 0.05
  ),
  constraint analysis_recommendation_v3_calibration_evidence_material_improvement check (
    (
      baseline_mean_excess_return is not null
      and variant_mean_excess_return is not null
      and variant_mean_excess_return - baseline_mean_excess_return >= 0.005
    )
    or (
      baseline_hit_rate is not null
      and variant_hit_rate is not null
      and variant_hit_rate - baseline_hit_rate >= 0.03
    )
  ),
  constraint analysis_recommendation_v3_calibration_evidence_mode check (
    (
      evidence_kind = 'BACKTEST'
      and frozen_dataset is true
      and unseen_sample is null
      and user_visible is false
    )
    or (
      evidence_kind = 'SHADOW'
      and frozen_dataset is null
      and unseen_sample is true
      and user_visible is false
    )
  ),
  unique (candidate_id, evidence_kind, variant_fingerprint, dataset_fingerprint)
);

create index if not exists analysis_recommendation_v3_calibration_evidence_candidate_idx
  on public.analysis_recommendation_v3_calibration_evidence (candidate_id, evidence_kind, observed_at desc);

create or replace function public.enforce_recommendation_v3_calibration_evidence_lineage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_candidate public.analysis_recommendation_v3_calibration_candidates%rowtype;
begin
  select * into v_candidate
  from public.analysis_recommendation_v3_calibration_candidates
  where id = new.candidate_id;

  if not found
    or new.analysis_archetype <> v_candidate.analysis_archetype
    or new.model_version <> v_candidate.model_version
    or new.recommendation_policy_version <> v_candidate.recommendation_policy_version
  then
    raise exception 'CALIBRATION_EVIDENCE_LINEAGE_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists recommendation_v3_calibration_evidence_lineage
  on public.analysis_recommendation_v3_calibration_evidence;
create trigger recommendation_v3_calibration_evidence_lineage
before insert on public.analysis_recommendation_v3_calibration_evidence
for each row execute function public.enforce_recommendation_v3_calibration_evidence_lineage();

create or replace function public.prevent_recommendation_v3_calibration_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Recommendation calibration evidence is append-only';
end;
$$;

drop trigger if exists recommendation_v3_calibration_evidence_append_only
  on public.analysis_recommendation_v3_calibration_evidence;
create trigger recommendation_v3_calibration_evidence_append_only
before update or delete on public.analysis_recommendation_v3_calibration_evidence
for each row execute function public.prevent_recommendation_v3_calibration_evidence_mutation();

alter table public.analysis_recommendation_v3_calibration_candidates
  add column if not exists backtest_evidence_id uuid
    references public.analysis_recommendation_v3_calibration_evidence(id) on delete restrict,
  add column if not exists shadow_evidence_id uuid
    references public.analysis_recommendation_v3_calibration_evidence(id) on delete restrict;

alter table public.analysis_recommendation_v3_calibration_events
  add column if not exists backtest_evidence_id uuid
    references public.analysis_recommendation_v3_calibration_evidence(id) on delete restrict,
  add column if not exists shadow_evidence_id uuid
    references public.analysis_recommendation_v3_calibration_evidence(id) on delete restrict;

alter table public.analysis_recommendation_v3_calibration_candidates
  drop constraint if exists analysis_recommendation_v3_calibration_stage_evidence;
alter table public.analysis_recommendation_v3_calibration_candidates
  add constraint analysis_recommendation_v3_calibration_stage_evidence check (
    (
      stage = 'CANDIDATE'
      and backtest_evidence_id is null
      and shadow_evidence_id is null
      and backtest_improved is null
      and shadow_improved is null
      and explicit_approval is false
    )
    or (
      stage = 'BACKTESTED'
      and backtest_evidence_id is not null
      and shadow_evidence_id is null
      and backtest_improved is true
      and shadow_improved is null
      and explicit_approval is false
    )
    or (
      stage = 'SHADOW_VALIDATED'
      and backtest_evidence_id is not null
      and shadow_evidence_id is not null
      and backtest_improved is true
      and shadow_improved is true
      and explicit_approval is false
    )
    or (
      stage = 'APPROVED'
      and backtest_evidence_id is not null
      and shadow_evidence_id is not null
      and backtest_improved is true
      and shadow_improved is true
      and explicit_approval is true
      and approved_at is not null
    )
    or (
      stage = 'PRODUCTION'
      and backtest_evidence_id is not null
      and shadow_evidence_id is not null
      and backtest_improved is true
      and shadow_improved is true
      and explicit_approval is true
      and approved_at is not null
      and production_at is not null
    )
  );

alter table public.analysis_recommendation_v3_calibration_evidence enable row level security;
revoke all on table public.analysis_recommendation_v3_calibration_evidence from public;
revoke all on table public.analysis_recommendation_v3_calibration_evidence from anon;
revoke all on table public.analysis_recommendation_v3_calibration_evidence from authenticated;
grant select, insert on table public.analysis_recommendation_v3_calibration_evidence to service_role;

revoke all on function public.enforce_recommendation_v3_calibration_evidence_lineage() from public;
revoke all on function public.enforce_recommendation_v3_calibration_evidence_lineage() from anon;
revoke all on function public.enforce_recommendation_v3_calibration_evidence_lineage() from authenticated;
revoke all on function public.prevent_recommendation_v3_calibration_evidence_mutation() from public;
revoke all on function public.prevent_recommendation_v3_calibration_evidence_mutation() from anon;
revoke all on function public.prevent_recommendation_v3_calibration_evidence_mutation() from authenticated;

drop function if exists public.advance_recommendation_v3_calibration(
  text, text, text, boolean, boolean, boolean, text, timestamptz
);

create function public.advance_recommendation_v3_calibration(
  p_candidate_key text,
  p_expected_stage text,
  p_next_stage text,
  p_backtest_evidence_id uuid default null,
  p_shadow_evidence_id uuid default null,
  p_explicit_approval boolean default false,
  p_reason text default null,
  p_occurred_at timestamptz default now()
)
returns setof public.analysis_recommendation_v3_calibration_candidates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.analysis_recommendation_v3_calibration_candidates%rowtype;
  v_backtest_evidence_id uuid;
  v_shadow_evidence_id uuid;
  v_explicit_approval boolean;
begin
  select * into v_candidate
  from public.analysis_recommendation_v3_calibration_candidates
  where candidate_key = p_candidate_key
  for update;

  if not found then
    raise exception 'CALIBRATION_CANDIDATE_NOT_FOUND';
  end if;
  if v_candidate.stage <> p_expected_stage then
    raise exception 'CALIBRATION_STAGE_CONFLICT';
  end if;
  if not (
    (p_expected_stage = 'CANDIDATE' and p_next_stage = 'BACKTESTED')
    or (p_expected_stage = 'BACKTESTED' and p_next_stage = 'SHADOW_VALIDATED')
    or (p_expected_stage = 'SHADOW_VALIDATED' and p_next_stage = 'APPROVED')
    or (p_expected_stage = 'APPROVED' and p_next_stage = 'PRODUCTION')
  ) then
    raise exception 'INVALID_CALIBRATION_STAGE_TRANSITION';
  end if;

  if p_explicit_approval is true and p_next_stage <> 'APPROVED' then
    raise exception 'CALIBRATION_APPROVAL_STAGE_INVALID';
  end if;

  v_backtest_evidence_id := coalesce(p_backtest_evidence_id, v_candidate.backtest_evidence_id);
  v_shadow_evidence_id := coalesce(p_shadow_evidence_id, v_candidate.shadow_evidence_id);
  v_explicit_approval := v_candidate.explicit_approval;

  if p_next_stage = 'BACKTESTED' then
    if p_backtest_evidence_id is null or not exists (
      select 1 from public.analysis_recommendation_v3_calibration_evidence e
      where e.id = p_backtest_evidence_id
        and e.candidate_id = v_candidate.id
        and e.evidence_kind = 'BACKTEST'
    ) then
      raise exception 'CALIBRATION_BACKTEST_EVIDENCE_REQUIRED';
    end if;
  end if;

  if p_next_stage = 'SHADOW_VALIDATED' then
    if v_backtest_evidence_id is null then
      raise exception 'CALIBRATION_BACKTEST_EVIDENCE_REQUIRED';
    end if;
    if p_shadow_evidence_id is null or not exists (
      select 1 from public.analysis_recommendation_v3_calibration_evidence e
      where e.id = p_shadow_evidence_id
        and e.candidate_id = v_candidate.id
        and e.evidence_kind = 'SHADOW'
    ) then
      raise exception 'CALIBRATION_SHADOW_EVIDENCE_REQUIRED';
    end if;
  end if;

  if p_next_stage = 'APPROVED' then
    if v_backtest_evidence_id is null or v_shadow_evidence_id is null then
      raise exception 'CALIBRATION_BACKTEST_AND_SHADOW_EVIDENCE_REQUIRED';
    end if;
    if p_explicit_approval is not true then
      raise exception 'CALIBRATION_EXPLICIT_APPROVAL_REQUIRED';
    end if;
    v_explicit_approval := true;
  end if;

  if p_next_stage = 'PRODUCTION' and not (
    v_backtest_evidence_id is not null
    and v_shadow_evidence_id is not null
    and v_candidate.explicit_approval is true
  ) then
    raise exception 'CALIBRATION_EXPLICIT_APPROVAL_AND_EVIDENCE_REQUIRED';
  end if;

  update public.analysis_recommendation_v3_calibration_candidates
  set
    stage = p_next_stage,
    backtest_evidence_id = v_backtest_evidence_id,
    shadow_evidence_id = v_shadow_evidence_id,
    backtest_improved = case when v_backtest_evidence_id is not null then true else null end,
    shadow_improved = case when v_shadow_evidence_id is not null then true else null end,
    explicit_approval = v_explicit_approval,
    approved_at = case
      when p_next_stage = 'APPROVED' then coalesce(approved_at, p_occurred_at)
      else approved_at
    end,
    production_at = case
      when p_next_stage = 'PRODUCTION' then coalesce(production_at, p_occurred_at)
      else production_at
    end,
    updated_at = p_occurred_at
  where id = v_candidate.id
  returning * into v_candidate;

  insert into public.analysis_recommendation_v3_calibration_events (
    candidate_id,
    from_stage,
    to_stage,
    backtest_improved,
    shadow_improved,
    explicit_approval,
    backtest_evidence_id,
    shadow_evidence_id,
    reason,
    occurred_at
  ) values (
    v_candidate.id,
    p_expected_stage,
    p_next_stage,
    v_candidate.backtest_improved,
    v_candidate.shadow_improved,
    v_candidate.explicit_approval,
    v_candidate.backtest_evidence_id,
    v_candidate.shadow_evidence_id,
    nullif(btrim(p_reason), ''),
    p_occurred_at
  );

  return next v_candidate;
end;
$$;

revoke all on function public.advance_recommendation_v3_calibration(
  text, text, text, uuid, uuid, boolean, text, timestamptz
) from public;
revoke all on function public.advance_recommendation_v3_calibration(
  text, text, text, uuid, uuid, boolean, text, timestamptz
) from anon;
revoke all on function public.advance_recommendation_v3_calibration(
  text, text, text, uuid, uuid, boolean, text, timestamptz
) from authenticated;
grant execute on function public.advance_recommendation_v3_calibration(
  text, text, text, uuid, uuid, boolean, text, timestamptz
) to service_role;

comment on table public.analysis_recommendation_v3_calibration_evidence is
  'Immutable private promotion evidence for StockBox 3.0 calibration. Only gate-passing frozen backtests and unseen non-user-visible shadow comparisons are accepted.';
comment on function public.advance_recommendation_v3_calibration(
  text, text, text, uuid, uuid, boolean, text, timestamptz
) is 'Advances calibration only with persisted evidence IDs. APPROVED requires explicit approval; PRODUCTION can only follow an already-approved candidate.';

commit;

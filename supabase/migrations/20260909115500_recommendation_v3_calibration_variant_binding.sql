begin;

alter table public.analysis_recommendation_v3_calibration_candidates
  add column if not exists variant_fingerprint text,
  add column if not exists variant_spec jsonb,
  add column if not exists variant_registered_at timestamptz;

alter table public.analysis_recommendation_v3_calibration_candidates
  drop constraint if exists analysis_recommendation_v3_calibration_variant_bundle;
alter table public.analysis_recommendation_v3_calibration_candidates
  add constraint analysis_recommendation_v3_calibration_variant_bundle check (
    (
      variant_fingerprint is null
      and variant_spec is null
      and variant_registered_at is null
    )
    or (
      btrim(variant_fingerprint) <> ''
      and variant_spec is not null
      and jsonb_typeof(variant_spec) = 'object'
      and variant_registered_at is not null
    )
  );

-- Legacy advanced rows predate variant registration. Preserve them as history,
-- but every future insert/update that is beyond CANDIDATE must prove a variant.
alter table public.analysis_recommendation_v3_calibration_candidates
  drop constraint if exists analysis_recommendation_v3_calibration_variant_required_for_evidence;
alter table public.analysis_recommendation_v3_calibration_candidates
  add constraint analysis_recommendation_v3_calibration_variant_required_for_evidence
  check (stage = 'CANDIDATE' or variant_fingerprint is not null) not valid;

create or replace function public.prevent_recommendation_v3_calibration_variant_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.variant_fingerprint is not null and (
    new.variant_fingerprint is distinct from old.variant_fingerprint
    or new.variant_spec is distinct from old.variant_spec
    or new.variant_registered_at is distinct from old.variant_registered_at
  ) then
    raise exception 'CALIBRATION_VARIANT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists recommendation_v3_calibration_variant_immutable
  on public.analysis_recommendation_v3_calibration_candidates;
create trigger recommendation_v3_calibration_variant_immutable
before update of variant_fingerprint, variant_spec, variant_registered_at
on public.analysis_recommendation_v3_calibration_candidates
for each row execute function public.prevent_recommendation_v3_calibration_variant_mutation();

create or replace function public.register_recommendation_v3_calibration_variant(
  p_candidate_key text,
  p_variant_fingerprint text,
  p_variant_spec jsonb,
  p_registered_at timestamptz default now()
)
returns setof public.analysis_recommendation_v3_calibration_candidates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.analysis_recommendation_v3_calibration_candidates%rowtype;
begin
  select * into v_candidate
  from public.analysis_recommendation_v3_calibration_candidates
  where candidate_key = p_candidate_key
  for update;

  if not found then
    raise exception 'CALIBRATION_CANDIDATE_NOT_FOUND';
  end if;
  if v_candidate.stage <> 'CANDIDATE' then
    raise exception 'CALIBRATION_VARIANT_REGISTRATION_STAGE_INVALID';
  end if;
  if btrim(coalesce(p_variant_fingerprint, '')) = '' then
    raise exception 'CALIBRATION_VARIANT_FINGERPRINT_REQUIRED';
  end if;
  if p_variant_spec is null or jsonb_typeof(p_variant_spec) <> 'object' then
    raise exception 'CALIBRATION_VARIANT_SPEC_REQUIRED';
  end if;

  if v_candidate.variant_fingerprint is not null then
    if v_candidate.variant_fingerprint = p_variant_fingerprint
      and v_candidate.variant_spec = p_variant_spec
    then
      return next v_candidate;
      return;
    end if;
    raise exception 'CALIBRATION_VARIANT_ALREADY_REGISTERED';
  end if;

  update public.analysis_recommendation_v3_calibration_candidates
  set
    variant_fingerprint = p_variant_fingerprint,
    variant_spec = p_variant_spec,
    variant_registered_at = p_registered_at,
    updated_at = p_registered_at
  where id = v_candidate.id
  returning * into v_candidate;

  return next v_candidate;
end;
$$;

-- Replace the evidence lineage trigger with exact variant binding. Existing
-- immutable evidence remains historical, but no new evidence can be attached
-- before variant registration or to a different implementation fingerprint.
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
  if v_candidate.variant_fingerprint is null then
    raise exception 'CALIBRATION_VARIANT_NOT_REGISTERED';
  end if;
  if new.variant_fingerprint <> v_candidate.variant_fingerprint then
    raise exception 'CALIBRATION_EVIDENCE_VARIANT_MISMATCH';
  end if;

  return new;
end;
$$;

-- Defense in depth for both the RPC and any future service-role code path. It
-- also blocks legacy evidence from advancing a newly registered variant unless
-- that evidence carries the exact same immutable fingerprint.
create or replace function public.enforce_recommendation_v3_calibration_variant_stage_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage <> 'CANDIDATE' then
    if new.variant_fingerprint is null then
      raise exception 'CALIBRATION_VARIANT_NOT_REGISTERED';
    end if;
    if new.backtest_evidence_id is not null and not exists (
      select 1
      from public.analysis_recommendation_v3_calibration_evidence e
      where e.id = new.backtest_evidence_id
        and e.candidate_id = new.id
        and e.evidence_kind = 'BACKTEST'
        and e.variant_fingerprint = new.variant_fingerprint
    ) then
      raise exception 'CALIBRATION_BACKTEST_VARIANT_MISMATCH';
    end if;
    if new.shadow_evidence_id is not null and not exists (
      select 1
      from public.analysis_recommendation_v3_calibration_evidence e
      where e.id = new.shadow_evidence_id
        and e.candidate_id = new.id
        and e.evidence_kind = 'SHADOW'
        and e.variant_fingerprint = new.variant_fingerprint
    ) then
      raise exception 'CALIBRATION_SHADOW_VARIANT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists recommendation_v3_calibration_variant_stage_evidence
  on public.analysis_recommendation_v3_calibration_candidates;
create trigger recommendation_v3_calibration_variant_stage_evidence
before insert or update of stage, backtest_evidence_id, shadow_evidence_id, variant_fingerprint
on public.analysis_recommendation_v3_calibration_candidates
for each row execute function public.enforce_recommendation_v3_calibration_variant_stage_evidence();

revoke all on function public.prevent_recommendation_v3_calibration_variant_mutation() from public;
revoke all on function public.prevent_recommendation_v3_calibration_variant_mutation() from anon;
revoke all on function public.prevent_recommendation_v3_calibration_variant_mutation() from authenticated;
revoke all on function public.enforce_recommendation_v3_calibration_variant_stage_evidence() from public;
revoke all on function public.enforce_recommendation_v3_calibration_variant_stage_evidence() from anon;
revoke all on function public.enforce_recommendation_v3_calibration_variant_stage_evidence() from authenticated;
revoke all on function public.register_recommendation_v3_calibration_variant(text, text, jsonb, timestamptz) from public;
revoke all on function public.register_recommendation_v3_calibration_variant(text, text, jsonb, timestamptz) from anon;
revoke all on function public.register_recommendation_v3_calibration_variant(text, text, jsonb, timestamptz) from authenticated;
grant execute on function public.register_recommendation_v3_calibration_variant(text, text, jsonb, timestamptz) to service_role;

comment on column public.analysis_recommendation_v3_calibration_candidates.variant_fingerprint is
  'Immutable SHA-256 fingerprint of the exact registered calibration variant. Backtest and shadow evidence must match it before promotion.';
comment on column public.analysis_recommendation_v3_calibration_candidates.variant_spec is
  'Private reproducibility manifest for the registered calibration variant. Registration alone never activates or exposes the variant.';
comment on function public.register_recommendation_v3_calibration_variant(text, text, jsonb, timestamptz) is
  'Registers one immutable CANDIDATE-stage calibration variant. This does not advance stage or activate production behavior.';

commit;

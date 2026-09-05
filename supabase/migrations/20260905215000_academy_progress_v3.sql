begin;

create table if not exists public.academy_progress_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 80),
  attempts integer not null default 0 check (attempts >= 0),
  best_score numeric(5,2) not null default 0 check (best_score >= 0 and best_score <= 100),
  passed boolean not null default false,
  completed_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists academy_progress_v3_user_updated_idx
  on public.academy_progress_v3 (user_id, updated_at desc);

alter table public.academy_progress_v3 enable row level security;

drop policy if exists "academy progress v3 select own" on public.academy_progress_v3;
create policy "academy progress v3 select own" on public.academy_progress_v3
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Quiz scores are computed by trusted StockBox server code. Authenticated
-- clients may read their own progress but cannot forge attempts or scores.
revoke insert, update, delete on table public.academy_progress_v3 from public, anon, authenticated;

create or replace function public.record_academy_attempt_v3(
  p_user_id uuid,
  p_lesson_id text,
  p_score numeric,
  p_passed boolean
)
returns public.academy_progress_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.academy_progress_v3;
  v_lesson_id text := trim(p_lesson_id);
begin
  if p_user_id is null then raise exception 'user id required'; end if;
  if v_lesson_id is null or char_length(v_lesson_id) < 1 or char_length(v_lesson_id) > 80 then
    raise exception 'invalid lesson id';
  end if;
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'invalid score';
  end if;

  insert into public.academy_progress_v3 (
    user_id,
    lesson_id,
    attempts,
    best_score,
    passed,
    completed_at,
    last_attempt_at,
    updated_at
  ) values (
    p_user_id,
    v_lesson_id,
    1,
    p_score,
    coalesce(p_passed, false),
    case when coalesce(p_passed, false) then now() else null end,
    now(),
    now()
  )
  on conflict (user_id, lesson_id) do update
  set attempts = public.academy_progress_v3.attempts + 1,
      best_score = greatest(public.academy_progress_v3.best_score, excluded.best_score),
      passed = public.academy_progress_v3.passed or excluded.passed,
      completed_at = case
        when public.academy_progress_v3.completed_at is not null then public.academy_progress_v3.completed_at
        when excluded.passed then now()
        else null
      end,
      last_attempt_at = now(),
      updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.record_academy_attempt_v3(uuid,text,numeric,boolean) from public, anon, authenticated;
grant execute on function public.record_academy_attempt_v3(uuid,text,numeric,boolean) to service_role;

commit;

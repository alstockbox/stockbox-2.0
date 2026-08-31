begin;

alter table public.profiles
  drop constraint if exists profiles_investment_profile_check;

alter table public.profiles
  add constraint profiles_investment_profile_check
  check (investment_profile in ('long_term', 'short_term', 'growth', 'value', 'quality', 'dividend', 'defensive', 'balanced'));

commit;

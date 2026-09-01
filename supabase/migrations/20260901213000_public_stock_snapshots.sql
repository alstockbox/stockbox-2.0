begin;

create table if not exists public.public_stock_snapshots (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  ticker text not null unique,
  company_name text not null,
  source_analysis_id uuid unique references public.analyses(id) on delete set null,
  report jsonb not null,
  score numeric(5,2),
  confidence numeric(7,6) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  data_coverage numeric(7,6) check (data_coverage is null or (data_coverage >= 0 and data_coverage <= 1)),
  data_as_of timestamptz,
  meta_description text check (meta_description is null or char_length(meta_description) <= 180),
  is_indexable boolean not null default false,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_stock_snapshots_indexable_updated_idx
  on public.public_stock_snapshots (is_indexable, updated_at desc);

alter table public.public_stock_snapshots enable row level security;

drop policy if exists "Public can read indexable stock snapshots" on public.public_stock_snapshots;
create policy "Public can read indexable stock snapshots"
  on public.public_stock_snapshots
  for select
  to anon, authenticated
  using (is_indexable = true);

grant select on public.public_stock_snapshots to anon, authenticated;
revoke insert, update, delete on public.public_stock_snapshots from anon, authenticated;

commit;

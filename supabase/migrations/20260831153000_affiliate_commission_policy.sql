begin;

-- Remove the global default commission floor. Individual affiliate rates remain configurable per row.
alter table public.affiliates
  alter column commission_basis_points set default 0;

commit;

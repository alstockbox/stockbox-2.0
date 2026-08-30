begin;

alter table public.affiliates
  alter column commission_basis_points set default 2000;

update public.affiliates
set commission_basis_points = greatest(commission_basis_points, 2000)
where status = 'active';

commit;
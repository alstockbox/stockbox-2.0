begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'batch_items'
      and column_name = 'company_payload'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'batch_items'
      and column_name = 'company'
  ) then
    alter table public.batch_items rename column company_payload to company;
  end if;
end
$$;

commit;

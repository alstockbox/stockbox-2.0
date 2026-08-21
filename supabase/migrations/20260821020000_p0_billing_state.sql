begin;

alter table public.plans alter column monthly_price_sek drop not null;

update public.plans
set monthly_price_sek = null,
    active = false,
    updated_at = now()
where key in ('standard', 'premium', 'elite');

update public.plans
set monthly_price_sek = case key when 'free' then 0 when 'basic' then 79 end,
    active = true,
    updated_at = now()
where key in ('free', 'basic');

commit;

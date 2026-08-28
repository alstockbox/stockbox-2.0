begin;

-- Supabase default table grants can include SELECT for anon.
-- RLS already denies anonymous rows, but remove the unnecessary table privilege too.
revoke all on public.withdrawal_requests from anon;
revoke insert, update, delete on public.withdrawal_requests from authenticated;
grant select on public.withdrawal_requests to authenticated;

commit;

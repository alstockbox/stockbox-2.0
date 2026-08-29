begin;

alter table public.analyses
  add column if not exists idempotency_key text,
  add column if not exists idempotency_fingerprint text;

alter table public.analyses
  drop constraint if exists analyses_idempotency_pair_check;
alter table public.analyses
  add constraint analyses_idempotency_pair_check
  check (
    (idempotency_key is null and idempotency_fingerprint is null)
    or (idempotency_key is not null and idempotency_fingerprint is not null)
  );

alter table public.analyses
  drop constraint if exists analyses_user_id_idempotency_key_key;
alter table public.analyses
  add constraint analyses_user_id_idempotency_key_key
  unique (user_id, idempotency_key);

commit;

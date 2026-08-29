begin;

create index if not exists affiliate_clawbacks_payout_idx
  on public.affiliate_clawbacks(payout_id)
  where payout_id is not null;

create index if not exists affiliate_commissions_payout_idx
  on public.affiliate_commissions(payout_id)
  where payout_id is not null;

create index if not exists affiliate_commissions_referred_user_idx
  on public.affiliate_commissions(referred_user_id);

create index if not exists affiliate_payouts_affiliate_idx
  on public.affiliate_payouts(affiliate_id);

create index if not exists referrals_affiliate_idx
  on public.referrals(affiliate_id)
  where affiliate_id is not null;

create index if not exists referrals_referrer_idx
  on public.referrals(referrer_id);

create index if not exists contact_messages_user_idx
  on public.contact_messages(user_id)
  where user_id is not null;

create index if not exists feedback_submissions_user_idx
  on public.feedback_submissions(user_id)
  where user_id is not null;

commit;

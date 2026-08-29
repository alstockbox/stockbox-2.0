export type CommissionStatus =
  | "pending"
  | "approved"
  | "payable"
  | "paid"
  | "reversed";

export function calculateCommissionCents(amountPaidCents: number, basisPoints: number) {
  if (!Number.isFinite(amountPaidCents) || !Number.isFinite(basisPoints)) return 0;
  const amount = Math.max(0, Math.floor(amountPaidCents));
  const bps = Math.max(0, Math.min(10_000, Math.floor(basisPoints)));
  return Math.floor((amount * bps) / 10_000);
}

export function commissionAvailableAt(paidAt: Date, holdDays: number) {
  const safeDays = Number.isFinite(holdDays) ? Math.max(0, Math.floor(holdDays)) : 30;
  return new Date(paidAt.getTime() + safeDays * 24 * 60 * 60 * 1000);
}

export function isCommissionPayable(
  status: CommissionStatus,
  availableAt: string | Date,
  now = new Date()
) {
  if (status !== "approved" && status !== "payable") return false;
  const available = availableAt instanceof Date ? availableAt : new Date(availableAt);
  return Number.isFinite(available.getTime()) && available.getTime() <= now.getTime();
}
export interface CommissionInput {
  totalAmount: number;
  rate: number;       // เปอร์เซ็นต์ เช่น 3 = 3%
  threshold: number;  // ยอดขั้นต่ำที่ต้องถึง
}

export interface CommissionResult {
  reachedThreshold: boolean;
  commission: number;
  remaining: number;
}

export function calculateCommission({ totalAmount, rate, threshold }: CommissionInput): CommissionResult {
  const reachedThreshold = threshold === 0 || totalAmount >= threshold;
  const commission = reachedThreshold ? Math.round(totalAmount * rate) / 100 : 0;
  const remaining = reachedThreshold ? 0 : threshold - totalAmount;
  return { reachedThreshold, commission, remaining };
}

export type VisitForCommission = {
  orderAmount?: number | null;
  slipStatus?: string | null;
};

export function classifyVisits(visits: VisitForCommission[]) {
  const confirmed = visits.filter(
    (v) => !v.slipStatus || v.slipStatus === 'verified' || v.slipStatus === 'approved',
  );
  const pending = visits.filter((v) => v.slipStatus === 'pending_approval');
  const totalAmount = confirmed.reduce((s, v) => s + (v.orderAmount ?? 0), 0);
  const pendingAmount = pending.reduce((s, v) => s + (v.orderAmount ?? 0), 0);
  return { confirmed, pending, totalAmount, pendingAmount };
}

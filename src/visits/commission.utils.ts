export interface CommissionTier {
  min: number;
  max: number | null;
  rate: number;
}

export interface TierBreakdown {
  min: number;
  max: number | null;
  rate: number;
  amount: number;
  commission: number;
}

export interface CommissionInput {
  totalAmount: number;
  rate: number;
  threshold: number;
  tiers?: CommissionTier[];
}

export interface CommissionResult {
  reachedThreshold: boolean;
  commission: number;
  remaining: number;
  breakdown?: TierBreakdown[];
}

export function calculateCommission({ totalAmount, rate, threshold, tiers }: CommissionInput): CommissionResult {
  const reachedThreshold = threshold === 0 || totalAmount >= threshold;
  if (!reachedThreshold) {
    return { reachedThreshold: false, commission: 0, remaining: threshold - totalAmount };
  }

  if (tiers && tiers.length > 0) {
    // flat tier: หา tier สูงสุดที่ totalAmount >= tier.min แล้วคิด rate นั้นกับยอดทั้งหมด
    let activeTier = tiers[0];
    for (const tier of tiers) {
      if (totalAmount >= tier.min) activeTier = tier;
    }
    const commission = Math.round(totalAmount * activeTier.rate) / 100;
    const breakdown: TierBreakdown[] = [{
      min: activeTier.min, max: activeTier.max, rate: activeTier.rate,
      amount: totalAmount, commission,
    }];
    return { reachedThreshold: true, commission, remaining: 0, breakdown };
  }

  const commission = Math.round(totalAmount * rate) / 100;
  return { reachedThreshold: true, commission, remaining: 0 };
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

import { calculateCommission, classifyVisits } from './commission.utils';

// ─────────────────────────────────────────────
// calculateCommission
// ─────────────────────────────────────────────
describe('calculateCommission', () => {
  describe('การถึงเป้า (threshold)', () => {
    it('ยอดถึงเป้าพอดี → ได้ค่าคอม, remaining = 0', () => {
      const r = calculateCommission({ totalAmount: 500, rate: 3, threshold: 500 });
      expect(r.reachedThreshold).toBe(true);
      expect(r.commission).toBe(15);
      expect(r.remaining).toBe(0);
    });

    it('ยอดเกินเป้า → ได้ค่าคอมเต็ม', () => {
      const r = calculateCommission({ totalAmount: 10_000, rate: 3, threshold: 500 });
      expect(r.reachedThreshold).toBe(true);
      expect(r.commission).toBe(300);
      expect(r.remaining).toBe(0);
    });

    it('ยอดต่ำกว่าเป้า → ค่าคอม 0, remaining ถูก', () => {
      const r = calculateCommission({ totalAmount: 400, rate: 3, threshold: 500 });
      expect(r.reachedThreshold).toBe(false);
      expect(r.commission).toBe(0);
      expect(r.remaining).toBe(100);
    });

    it('ยอดห่างจากเป้ามาก → remaining ถูก', () => {
      const r = calculateCommission({ totalAmount: 0, rate: 3, threshold: 1000 });
      expect(r.remaining).toBe(1000);
    });
  });

  describe('threshold = 0 (ไม่มีขั้นต่ำ)', () => {
    it('คำนวณค่าคอมเสมอไม่ว่ายอดจะเท่าไร', () => {
      const r = calculateCommission({ totalAmount: 200, rate: 3, threshold: 0 });
      expect(r.reachedThreshold).toBe(true);
      expect(r.commission).toBe(6);
    });

    it('ยอด 0, threshold 0 → ค่าคอม 0', () => {
      const r = calculateCommission({ totalAmount: 0, rate: 3, threshold: 0 });
      expect(r.commission).toBe(0);
    });
  });

  describe('rate edge cases', () => {
    it('rate = 0 → ค่าคอม 0 เสมอ', () => {
      const r = calculateCommission({ totalAmount: 10_000, rate: 0, threshold: 0 });
      expect(r.commission).toBe(0);
    });

    it('rate = 5% คำนวณถูก', () => {
      const r = calculateCommission({ totalAmount: 2000, rate: 5, threshold: 0 });
      expect(r.commission).toBe(100);
    });
  });

  describe('Math.round', () => {
    it('2806 บาท × 3% = 84.18 บาท', () => {
      // 2806 * 3 = 8418 → Math.round(8418) / 100 = 84.18
      const r = calculateCommission({ totalAmount: 2806, rate: 3, threshold: 500 });
      expect(r.commission).toBe(84.18);
    });

    it('ยอดที่ผลคูณไม่เป็นจำนวนเต็มสตางค์ → ปัดถูก', () => {
      // 333 * 3 = 999 → 999/100 = 9.99
      const r = calculateCommission({ totalAmount: 333, rate: 3, threshold: 0 });
      expect(r.commission).toBe(9.99);
    });
  });
});

// ─────────────────────────────────────────────
// classifyVisits
// ─────────────────────────────────────────────
describe('classifyVisits', () => {
  describe('การจำแนก slipStatus', () => {
    it('slipStatus = null → นับเป็น confirmed', () => {
      const { confirmed, pending, totalAmount } = classifyVisits([
        { orderAmount: 1000, slipStatus: null },
      ]);
      expect(confirmed).toHaveLength(1);
      expect(pending).toHaveLength(0);
      expect(totalAmount).toBe(1000);
    });

    it('slipStatus = verified → นับเป็น confirmed', () => {
      const { confirmed, totalAmount } = classifyVisits([
        { orderAmount: 500, slipStatus: 'verified' },
      ]);
      expect(confirmed).toHaveLength(1);
      expect(totalAmount).toBe(500);
    });

    it('slipStatus = approved → นับเป็น confirmed', () => {
      const { confirmed, totalAmount } = classifyVisits([
        { orderAmount: 800, slipStatus: 'approved' },
      ]);
      expect(confirmed).toHaveLength(1);
      expect(totalAmount).toBe(800);
    });

    it('slipStatus = pending_approval → ไม่นับใน totalAmount, นับใน pendingAmount', () => {
      const { confirmed, pending, totalAmount, pendingAmount } = classifyVisits([
        { orderAmount: 1000, slipStatus: 'pending_approval' },
      ]);
      expect(confirmed).toHaveLength(0);
      expect(pending).toHaveLength(1);
      expect(totalAmount).toBe(0);
      expect(pendingAmount).toBe(1000);
    });
  });

  describe('ผสม confirmed + pending', () => {
    it('แยกถูกต้อง และรวมยอดถูก', () => {
      const visits = [
        { orderAmount: 1000, slipStatus: null },          // confirmed
        { orderAmount: 500,  slipStatus: 'verified' },    // confirmed
        { orderAmount: 800,  slipStatus: 'pending_approval' }, // pending
        { orderAmount: 300,  slipStatus: 'approved' },    // confirmed
      ];
      const { confirmed, pending, totalAmount, pendingAmount } = classifyVisits(visits);
      expect(confirmed).toHaveLength(3);
      expect(pending).toHaveLength(1);
      expect(totalAmount).toBe(1800);   // 1000 + 500 + 300
      expect(pendingAmount).toBe(800);
    });
  });

  describe('edge cases', () => {
    it('orderAmount = null → นับเป็น 0', () => {
      const { totalAmount } = classifyVisits([{ orderAmount: null, slipStatus: null }]);
      expect(totalAmount).toBe(0);
    });

    it('visits เป็น [] → ทุก field เป็น 0', () => {
      const { confirmed, pending, totalAmount, pendingAmount } = classifyVisits([]);
      expect(confirmed).toHaveLength(0);
      expect(pending).toHaveLength(0);
      expect(totalAmount).toBe(0);
      expect(pendingAmount).toBe(0);
    });

    it('ล้าน visit → รวมยอดถูก', () => {
      const visits = Array.from({ length: 100 }, () => ({ orderAmount: 100, slipStatus: null }));
      const { totalAmount } = classifyVisits(visits);
      expect(totalAmount).toBe(10_000);
    });
  });

  describe('integration: classifyVisits + calculateCommission', () => {
    it('ผสม visit → ค่าคอมถูก (pending ไม่เข้าคำนวณ)', () => {
      const visits = [
        { orderAmount: 300, slipStatus: 'verified' },
        { orderAmount: 700, slipStatus: null },
        { orderAmount: 9999, slipStatus: 'pending_approval' }, // ไม่นับ
      ];
      const { totalAmount } = classifyVisits(visits);
      const { commission, reachedThreshold } = calculateCommission({ totalAmount, rate: 3, threshold: 500 });
      // totalAmount = 300 + 700 = 1000
      expect(totalAmount).toBe(1000);
      expect(reachedThreshold).toBe(true);
      expect(commission).toBe(30); // 1000 * 3 / 100
    });

    it('ยอด confirmed ไม่ถึงเป้า แม้รวม pending แล้วจะถึง → ยังไม่ได้ค่าคอม', () => {
      const visits = [
        { orderAmount: 400, slipStatus: 'verified' },   // นับ
        { orderAmount: 200, slipStatus: 'pending_approval' }, // ไม่นับ
      ];
      const { totalAmount } = classifyVisits(visits);
      const { commission, reachedThreshold } = calculateCommission({ totalAmount, rate: 3, threshold: 500 });
      // totalAmount = 400 เท่านั้น → ยังไม่ถึง 500
      expect(reachedThreshold).toBe(false);
      expect(commission).toBe(0);
    });
  });
});

import { SlipsService } from './slips.service';

/**
 * Unit tests for applyDebtDeduction logic.
 * Uses mock PrismaService — no DB required.
 */

function makeSlipsService(overrides: {
  slipDebtDeducted?: number;
  outstandingDebt?: number;
  transactionResult?: number;
}) {
  const { slipDebtDeducted = 0, outstandingDebt = 0 } = overrides;

  const mockTx = {
    slipSubmission: {
      findUnique: jest.fn().mockResolvedValue({ id: 'slip-1', debtDeducted: slipDebtDeducted }),
      update: jest.fn().mockResolvedValue({}),
    },
    commissionAdjustment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: outstandingDebt } }),
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockPrisma = {
    $transaction: jest.fn((fn: any) => fn(mockTx)),
  };

  const service = new (SlipsService as any)(
    mockPrisma,
    { sendToGroupsWithUrls: jest.fn() }, // LineService mock
    { getOutstandingDebt: jest.fn(), createDeduction: jest.fn() }, // CommissionAdjustmentsService mock (unused — tx reads directly)
  );

  return { service, mockTx };
}

describe('SlipsService.applyDebtDeduction', () => {
  it('ไม่หักถ้าไม่มียอดค้าง', async () => {
    const { service, mockTx } = makeSlipsService({ outstandingDebt: 0 });
    const result = await service.applyDebtDeduction('slip-1', 'user-1', 100_000, 'admin-1');
    expect(result).toBe(0);
    expect(mockTx.slipSubmission.update).not.toHaveBeenCalled();
  });

  it('ไม่หักถ้า slip นั้นหักไปแล้ว (idempotency)', async () => {
    const { service, mockTx } = makeSlipsService({ slipDebtDeducted: 30_000, outstandingDebt: 20_000 });
    const result = await service.applyDebtDeduction('slip-1', 'user-1', 100_000, 'admin-1');
    expect(result).toBe(0);
    expect(mockTx.slipSubmission.update).not.toHaveBeenCalled();
  });

  it('หักเต็มหนี้เมื่อ slip มากกว่าหนี้', async () => {
    const { service, mockTx } = makeSlipsService({ outstandingDebt: 50_000 });
    const result = await service.applyDebtDeduction('slip-1', 'user-1', 100_000, 'admin-1');
    expect(result).toBe(50_000);
    expect(mockTx.slipSubmission.update).toHaveBeenCalledWith({
      where: { id: 'slip-1' },
      data: { debtDeducted: 50_000 },
    });
    expect(mockTx.commissionAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -50_000 }) })
    );
  });

  it('หักแค่ยอด slip เมื่อหนี้มากกว่า slip', async () => {
    const { service, mockTx } = makeSlipsService({ outstandingDebt: 80_000 });
    const result = await service.applyDebtDeduction('slip-1', 'user-1', 30_000, 'admin-1');
    expect(result).toBe(30_000);
    expect(mockTx.slipSubmission.update).toHaveBeenCalledWith({
      where: { id: 'slip-1' },
      data: { debtDeducted: 30_000 },
    });
  });

  it('รองรับยอดทศนิยม (เศษบาท)', async () => {
    const { service, mockTx } = makeSlipsService({ outstandingDebt: 50_000.50 });
    const result = await service.applyDebtDeduction('slip-1', 'user-1', 30_000, 'admin-1');
    expect(result).toBe(30_000);
    expect(mockTx.slipSubmission.update).toHaveBeenCalledWith({
      where: { id: 'slip-1' },
      data: { debtDeducted: 30_000 },
    });
  });

  it('หักเศษทศนิยมได้ถูกต้องเมื่อหนี้น้อยกว่า slip', async () => {
    const { service, mockTx } = makeSlipsService({ outstandingDebt: 20_000.75 });
    const result = await service.applyDebtDeduction('slip-1', 'user-1', 50_000, 'admin-1');
    expect(result).toBe(20_000.75);
    expect(mockTx.slipSubmission.update).toHaveBeenCalledWith({
      where: { id: 'slip-1' },
      data: { debtDeducted: 20_000.75 },
    });
  });
});

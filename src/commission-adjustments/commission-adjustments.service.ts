import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class CommissionAdjustmentsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    month: string;
    amount: number;
    note?: string;
    type?: string;
    createdBy: string;
  }) {
    if (data.amount === 0) throw new BadRequestException('amount must not be zero');
    if (data.amount > 50000) throw new BadRequestException('ช่วยยอดได้ไม่เกิน 50,000 บาทต่อครั้ง');

    const adjustment = await this.prisma.commissionAdjustment.create({
      data: {
        userId: data.userId,
        month: data.month,
        amount: data.amount,
        note: data.note,
        type: data.type ?? 'loan_help',
        createdBy: data.createdBy,
      },
    });

    // เมื่อ admin เพิ่ม loan_help → scan slips เดือนปัจจุบันที่ยังไม่ถูกหัก แล้ว apply อัตโนมัติ
    if ((data.type ?? 'loan_help') === 'loan_help') {
      await this.applyDebtToExistingSlips(data.userId, data.createdBy);
    }

    return adjustment;
  }

  // หักยอดค้างจาก verified/approved slips ที่ยังไม่ถูกหักในเดือนที่กำหนด
  async applyDebtToExistingSlips(userId: string, adminId: string, targetMonth?: string): Promise<number> {
    const month = targetMonth ?? getCurrentMonth();
    const [year, monthNum] = month.split('-').map(Number);

    // คำนวณยอดค้างจากเดือนก่อน (ไม่รวมเดือนปัจจุบัน)
    const [prevPosResult, allNegResult] = await Promise.all([
      this.prisma.commissionAdjustment.aggregate({
        where: { userId, month: { lt: month }, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.commissionAdjustment.aggregate({
        where: { userId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
    ]);
    let remainingDebt = Math.max(0, (prevPosResult._sum.amount ?? 0) + (allNegResult._sum.amount ?? 0));
    if (remainingDebt <= 0) return 0;

    // หา verified/approved slips ในเดือนที่กำหนด ที่ยังไม่มีการหักหนี้
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);

    const undeductedSlips = await this.prisma.slipSubmission.findMany({
      where: {
        userId,
        slipStatus: { in: ['verified', 'approved'] },
        createdAt: { gte: monthStart, lte: monthEnd },
        NOT: { debtDeducted: { gt: 0 } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalApplied = 0;
    for (const slip of undeductedSlips) {
      if (remainingDebt <= 0) break;
      const slipAmount = slip.amount ?? 0;
      if (slipAmount <= 0) continue;

      const deductAmount = Math.min(remainingDebt, slipAmount);

      await this.prisma.$transaction([
        this.prisma.slipSubmission.update({
          where: { id: slip.id },
          data: { debtDeducted: deductAmount },
        }),
        this.prisma.commissionAdjustment.create({
          data: {
            userId,
            month,
            amount: -deductAmount,
            note: `หักคืนยอดค้างจาก slip #${slip.id.slice(-6)}`,
            type: 'repayment',
            createdBy: adminId,
          },
        }),
      ]);

      remainingDebt -= deductAmount;
      totalApplied += deductAmount;
    }

    return totalApplied;
  }

  // สร้าง record หักคืนเมื่อจ่ายค่าคอม
  async createDeduction(data: {
    userId: string;
    month: string;
    amount: number; // ส่งมาเป็นบวก ระบบแปลงเป็นลบให้
    createdBy: string;
  }) {
    return this.prisma.commissionAdjustment.create({
      data: {
        userId: data.userId,
        month: data.month,
        amount: -Math.abs(data.amount),
        note: `หักคืนยอดค้างเดือน ${data.month}`,
        type: 'repayment',
        createdBy: data.createdBy,
      },
    });
  }

  // ยอดค้างปัจจุบัน = SUM ทุก record ของ user
  async getOutstandingDebt(userId: string): Promise<number> {
    const result = await this.prisma.commissionAdjustment.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return Math.max(0, result._sum.amount ?? 0);
  }

  async findByMonth(month: string) {
    return this.prisma.commissionAdjustment.findMany({
      where: { month },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUserAndMonth(userId: string, month: string) {
    return this.prisma.commissionAdjustment.findMany({
      where: { userId, month },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.commissionAdjustment.findMany({
      where: { userId },
      include: { admin: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async sumByUserAndMonth(userId: string, month: string): Promise<number> {
    const result = await this.prisma.commissionAdjustment.aggregate({
      where: { userId, month },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  // ยอดค้างทุก user — ใช้แสดงใน Users page
  async getOutstandingDebtAll(): Promise<{ userId: string; outstandingDebt: number }[]> {
    const rows = await this.prisma.commissionAdjustment.groupBy({
      by: ['userId'],
      _sum: { amount: true },
    });
    return rows
      .map((r) => ({ userId: r.userId, outstandingDebt: Math.max(0, r._sum.amount ?? 0) }))
      .filter((r) => r.outstandingDebt > 0);
  }
}

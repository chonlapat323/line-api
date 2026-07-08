import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommissionAdjustmentsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    month: string;
    amount: number;
    note?: string;
    createdBy: string;
  }) {
    if (data.amount === 0) throw new BadRequestException('amount must not be zero');

    return this.prisma.commissionAdjustment.create({
      data: {
        userId: data.userId,
        month: data.month,
        amount: data.amount,
        note: data.note,
        createdBy: data.createdBy,
      },
    });
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
}

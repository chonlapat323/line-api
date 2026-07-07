import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1); // m is already 1-based, so new Date(y, m) = first day of next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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

    // Create the positive adjustment for the given month
    const adj = await this.prisma.commissionAdjustment.create({
      data: {
        userId: data.userId,
        month: data.month,
        amount: data.amount,
        note: data.note,
        createdBy: data.createdBy,
      },
    });

    // Auto-create deduction in the next month
    await this.prisma.commissionAdjustment.create({
      data: {
        userId: data.userId,
        month: nextMonth(data.month),
        amount: -data.amount,
        note: `หักล้างจากที่ช่วยเดือน ${data.month}`,
        createdBy: data.createdBy,
      },
    });

    return adj;
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

  async sumByUserAndMonth(userId: string, month: string): Promise<number> {
    const result = await this.prisma.commissionAdjustment.aggregate({
      where: { userId, month },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }
}

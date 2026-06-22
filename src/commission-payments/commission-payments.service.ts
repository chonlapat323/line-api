import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommissionPaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(params: {
    userId: string;
    month: string;
    amount: number;
    paidBy: string;
    note?: string;
    slipUrl?: string;
  }) {
    return this.prisma.commissionPayment.upsert({
      where: { userId_month: { userId: params.userId, month: params.month } },
      update: {
        amount: params.amount,
        paidBy: params.paidBy,
        note: params.note ?? null,
        slipUrl: params.slipUrl ?? null,
        paidAt: new Date(),
      },
      create: {
        userId: params.userId,
        month: params.month,
        amount: params.amount,
        paidBy: params.paidBy,
        note: params.note ?? null,
        slipUrl: params.slipUrl ?? null,
      },
      include: {
        user: { select: { fullName: true, email: true, bankName: true, bankAccount: true } },
        admin: { select: { fullName: true } },
      },
    });
  }

  async findByMonth(month: string) {
    return this.prisma.commissionPayment.findMany({
      where: { month },
      include: {
        user: { select: { id: true, fullName: true, email: true, bankName: true, bankAccount: true } },
        admin: { select: { fullName: true } },
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  async findAll(params: { userId?: string; month?: string } = {}) {
    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.month) where.month = params.month;
    return this.prisma.commissionPayment.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, bankName: true, bankAccount: true } },
        admin: { select: { fullName: true } },
      },
      orderBy: { paidAt: 'desc' },
    });
  }
}

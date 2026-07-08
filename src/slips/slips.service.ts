import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';
import { CommissionAdjustmentsService } from '../commission-adjustments/commission-adjustments.service';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class SlipsService {
  private readonly logger = new Logger(SlipsService.name);

  constructor(
    private prisma: PrismaService,
    private lineService: LineService,
    private commissionAdjustments: CommissionAdjustmentsService,
  ) {}

  async applyDebtDeduction(slipId: string, userId: string, slipAmount: number, adminId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // ล็อก slip ไว้ก่อน — idempotency check
      const slip = await tx.slipSubmission.findUnique({ where: { id: slipId } });
      if (!slip || (slip.debtDeducted ?? 0) > 0) return 0;

      // อ่านยอดค้างภายใน transaction — ป้องกัน race condition
      const result = await tx.commissionAdjustment.aggregate({
        where: { userId },
        _sum: { amount: true },
      });
      const debt = Math.max(0, result._sum.amount ?? 0);
      if (debt <= 0 || slipAmount <= 0) return 0;

      const deductAmount = Math.min(debt, slipAmount);
      const month = getCurrentMonth();

      await tx.slipSubmission.update({
        where: { id: slipId },
        data: { debtDeducted: deductAmount },
      });
      await tx.commissionAdjustment.create({
        data: { userId, month, amount: -deductAmount, note: `หักคืนยอดค้างเดือน ${month}`, createdBy: adminId },
      });

      return deductAmount;
    }, { isolationLevel: 'Serializable' });
  }

  async submit(params: {
    userId: string;
    shopName: string;
    amount?: number | null;
    details?: string;
    slipUrl: string;
    slipStatus: string;
    transRef?: string;
  }) {
    const submission = await this.prisma.slipSubmission.create({
      data: {
        userId: params.userId,
        shopName: params.shopName,
        amount: params.amount ?? null,
        details: params.details ?? null,
        slipUrl: params.slipUrl,
        slipStatus: params.slipStatus,
        transRef: params.transRef ?? null,
      },
    });

    if (params.slipStatus === 'verified' && params.amount) {
      await Promise.all([
        this.sendToLine(submission.id, params.userId, params.slipUrl, params.shopName, params.amount, params.details),
        this.applyDebtDeduction(submission.id, params.userId, params.amount, params.userId),
      ]);
    }

    return submission;
  }

  private async sendToLine(
    submissionId: string,
    userId: string,
    slipUrl: string,
    shopName: string,
    amount: number,
    details?: string,
  ) {
    try {
      await this.lineService.sendToGroupsWithUrls({
        senderId: userId,
        imageUrls: [slipUrl],
        targetUserIds: [userId],
        title: shopName,
        price: `฿${amount.toLocaleString('th-TH')}`,
        note: details ?? '',
      });
      await this.prisma.slipSubmission.update({
        where: { id: submissionId },
        data: { lineStatus: 'sent' },
      });
    } catch (err) {
      this.logger.error(`LINE send failed for slip ${submissionId}: ${err.message}`);
      await this.prisma.slipSubmission.update({
        where: { id: submissionId },
        data: { lineStatus: 'failed' },
      });
    }
  }

  async findAll(params: {
    userId: string;
    role: string;
    filterUserId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, role, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = role !== 'admin' ? { userId } : {};
    if (params.filterUserId) where.userId = params.filterUserId;
    if (params.status) where.slipStatus = params.status;
    if (params.search) {
      where.OR = [
        { shopName: { contains: params.search, mode: 'insensitive' } },
        { user: { fullName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
      if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.slipSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { fullName: true, email: true } } },
      }),
      this.prisma.slipSubmission.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async approve(params: {
    id: string;
    action: 'approve' | 'reject';
    amount?: number;
    adminId: string;
  }) {
    const submission = await this.prisma.slipSubmission.findUnique({ where: { id: params.id } });
    if (!submission) throw new NotFoundException('ไม่พบข้อมูล');
    if (submission.slipStatus !== 'pending_approval') throw new ForbiddenException('สถานะไม่ถูกต้อง');

    if (params.action === 'reject') {
      return this.prisma.slipSubmission.update({
        where: { id: params.id },
        data: { slipStatus: 'rejected', approvedBy: params.adminId, approvedAt: new Date() },
      });
    }

    const amount = params.amount ?? submission.amount ?? 0;
    const updated = await this.prisma.slipSubmission.update({
      where: { id: params.id },
      data: { slipStatus: 'approved', amount, approvedBy: params.adminId, approvedAt: new Date() },
    });

    await Promise.all([
      this.sendToLine(submission.id, submission.userId, submission.slipUrl, submission.shopName, amount, submission.details ?? undefined),
      this.applyDebtDeduction(submission.id, submission.userId, amount, params.adminId),
    ]);

    return updated;
  }
}

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';

@Injectable()
export class SlipsService {
  private readonly logger = new Logger(SlipsService.name);

  constructor(
    private prisma: PrismaService,
    private lineService: LineService,
  ) {}

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
      await this.sendToLine(submission.id, params.userId, params.slipUrl, params.shopName, params.amount, params.details);
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

  async findAll(userId: string, role: string) {
    const where = role === 'admin' ? {} : { userId };
    return this.prisma.slipSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { fullName: true, email: true } },
      },
    });
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

    await this.sendToLine(
      submission.id,
      submission.userId,
      submission.slipUrl,
      submission.shopName,
      amount,
      submission.details ?? undefined,
    );

    return updated;
  }
}

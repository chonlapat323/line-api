import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FlowAccountService } from './flowaccount.service';

type SalesOverview = {
  from: string;
  to: string;
  salesTotal: number;      // ยอดซื้อจากลูกค้า = ใบส่งของ/ใบแจ้งหนี้ + ขายเงินสด (FlowAccount)
  invoiceTotal: number;
  invoiceCount: number;
  cashTotal: number;
  cashCount: number;
  slipTotal: number;       // ยอดที่เซลล์เก็บ = สลิปที่ยืนยัน QR / อนุมัติแล้ว
  slipCount: number;
};

const CACHE_MS = 10 * 60 * 1000;            // ช่วงที่รวมวันนี้ — เอกสารยังเพิ่มได้
const CACHE_PAST_MS = 6 * 60 * 60 * 1000;    // ช่วงที่จบก่อนวันนี้ — แทบไม่เปลี่ยน พักนานกว่า
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('flowaccount')
@UseGuards(JwtAuthGuard)
export class FlowAccountController {
  // พักผลต่อช่วงวันที่ ไม่ต้องยิง FlowAccount ทุกครั้งที่เปิดหน้า (เดือนละ ~2 หน้า × 2 เอกสาร)
  private cache = new Map<string, { at: number; value: SalesOverview }>();

  constructor(
    private readonly flowAccount: FlowAccountService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('sales-overview')
  async salesOverview(@Query('from') from: string, @Query('to') to: string): Promise<SalesOverview> {
    if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '') || from > to) {
      throw new BadRequestException('from/to ต้องเป็น YYYY-MM-DD และ from <= to');
    }
    const key = `${from}|${to}`;
    const hit = this.cache.get(key);
    const today = new Date().toISOString().slice(0, 10);
    const ttl = to < today ? CACHE_PAST_MS : CACHE_MS;
    if (hit && Date.now() - hit.at < ttl) return hit.value;

    const [invoice, cash, slipAgg] = await Promise.all([
      this.flowAccount.sumDocuments('/tax-invoices', from, to),
      this.flowAccount.sumDocuments('/cash-invoices', from, to),
      this.prisma.slipSubmission.aggregate({
        where: {
          slipStatus: { in: ['verified', 'approved'] },
          createdAt: { gte: new Date(from + 'T00:00:00'), lte: new Date(to + 'T23:59:59') },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const value: SalesOverview = {
      from, to,
      salesTotal: Math.round((invoice.total + cash.total) * 100) / 100,
      invoiceTotal: invoice.total, invoiceCount: invoice.count,
      cashTotal: cash.total, cashCount: cash.count,
      slipTotal: slipAgg._sum.amount ?? 0,
      slipCount: slipAgg._count,
    };
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}

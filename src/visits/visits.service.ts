import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';
import { GoogleService } from '../google/google.service';
import { calculateCommission, classifyVisits } from './commission.utils';

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private prisma: PrismaService,
    private lineService: LineService,
    private googleService: GoogleService,
  ) {}

  async create(params: {
    userId: string;
    files: Express.Multer.File[];
    shopName: string;
    province: string;
    district: string;
    latitude: number;
    longitude: number;
    tripType: string;
    customerType: string;
    visitType: string;
    result: string;
    details: string;
    orderAmount: number | null;
    userEmail: string;
    slipUrl?: string | null;
    slipStatus?: string | null;
    transRef?: string | null;
  }) {
    const appUrl = process.env.APP_URL || 'http://localhost:3002';
    const imageUrls = params.files.map((f) => `${appUrl}/uploads/line/${f.filename}`);

    const record = await this.prisma.visitRecord.create({
      data: {
        userId: params.userId,
        shopName: params.shopName,
        province: params.province,
        district: params.district || null,
        latitude: params.latitude,
        longitude: params.longitude,
        tripType: params.tripType || null,
        customerType: params.customerType,
        visitType: params.visitType || null,
        result: params.result || null,
        details: params.details || null,
        orderAmount: params.orderAmount ?? null,
        imageUrls,
        slipUrl: params.slipUrl ?? null,
        slipStatus: params.slipStatus ?? null,
        transRef: params.transRef ?? null,
      },
    });

    const tripMap: Record<string, string> = {
      plan: 'ตามแผน', off_plan: 'นอกแผน',
    };
    const missionMap: Record<string, string> = { tak: 'ทัก', dem: 'เดม', tel: 'โทร' };
    const resultMap: Record<string, string> = { buy: 'ซื้อ', no_buy: 'ไม่ซื้อ', not_found: 'ไม่พบ' };
    const customerLabel = params.customerType === 'new' ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า';
    const locationLabel = params.district
      ? `${params.province} เขต${params.district}`
      : params.province;

    const noteParts = [
      locationLabel,
      params.tripType ? tripMap[params.tripType] : '',
      customerLabel,
      params.visitType ? missionMap[params.visitType] : '',
      params.result ? `ผล: ${resultMap[params.result]}` : '',
      params.details,
    ].filter(Boolean).join(' · ');

    // Map server image URLs by slot key for Sheet
    const slotKeys = ['front1', 'front2', 'inside1', 'inside2', 'line', 'xray', 'quotation'];
    const slotUrls: Record<string, string> = {};
    for (const file of params.files) {
      const slotKey = slotKeys.find((k) => file.originalname.startsWith(k + '-'));
      if (slotKey) slotUrls[slotKey] = `${appUrl}/uploads/line/${file.filename}`;
    }

    // Append row to Google Sheet
    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const mapsUrl = params.latitude && params.longitude
      ? `https://maps.google.com/?q=${params.latitude},${params.longitude}`
      : '';
    try {
      const visitSheetSetting = await this.prisma.setting.findUnique({ where: { key: 'visit_sheet_id' } });
      const visitSheetId = visitSheetSetting?.value || process.env.GOOGLE_SHEET_ID || '';
      this.logger.log(`Google Sheets: using visit_sheet_id="${visitSheetId}" (from ${visitSheetSetting?.value ? 'DB' : 'env'})`);
      if (!visitSheetId) throw new Error('visit_sheet_id not configured');
      await this.googleService.appendToSheetById(
        visitSheetId,
        [
          now,
          params.userEmail,
          params.tripType ? tripMap[params.tripType] : '',
          params.visitType ? missionMap[params.visitType] : '',
          customerLabel,
          params.shopName,
          mapsUrl,
          params.province,
          params.district || '',
          params.result ? resultMap[params.result] : '',
          slotUrls['line'] || '',
          slotUrls['front1'] || '',
          slotUrls['inside1'] || '',
          params.details || '',
          slotUrls['xray'] || '',
        ],
        [
          'ประทับเวลา', 'ที่อยู่อีเมล', 'ทริป', 'ภารกิจ', 'ลูกค้า',
          'ชื่อร้าน', 'Link Google Maps', 'จังหวัด', '(*สำหรับกทม.)',
          'ผลตอบรับ', 'Line OA (1 รูป)', 'รูปหน้าร้าน (1รูป)', 'รูปในร้าน (1รูป)',
          'สรุปผล', 'ใบ X-Ray ส่ง (1รูป)',
        ],
      );
    } catch (e) {
      this.logger.warn(`Google Sheets append failed: ${e.message} | status=${e.status ?? e.code} | errors=${JSON.stringify(e.errors ?? e.response?.data ?? '-')}`);
    }

    // Log to commission sheet if QR-verified slip (no admin approval needed)
    if (params.result === 'buy' && params.slipStatus === 'verified') {
      try {
        const sheetSetting = await this.prisma.setting.findUnique({ where: { key: 'commission_sheet_id' } });
        const sheetId = sheetSetting?.value;
        if (sheetId) {
          await this.googleService.appendToSheetById(
            sheetId,
            [
              now,
              params.userEmail,
              params.slipUrl || '',
              params.details || '',
              params.province || '',
              params.shopName || '',
              String(params.orderAmount ?? 0),
              customerLabel,
            ],
            ['ประทับเวลา', 'ที่อยู่อีเมล', 'สลิปธนาคาร', 'หมายเหตุ (ถ้ามี)', 'จังหวัด', 'ชื่อร้าน', 'ยอดเงิน (บาท)', 'ลูกค้า'],
          );
        }
      } catch (e) {
        this.logger.warn(`Commission sheet log failed: ${e.message}`);
      }
    }

    // Send to LINE Group
    const lineResult = await this.lineService.sendToGroups({
      senderId: params.userId,
      files: params.files,
      targetUserIds: [params.userId],
      title: params.shopName,
      price: params.result === 'buy' && params.orderAmount != null
        ? `฿${params.orderAmount.toLocaleString('th-TH')}`
        : '',
      note: noteParts,
      type: 'trip',
    });

    return { record, lineResult };
  }

  async findAll(params: {
    userId: string;
    role: string;
    page: number;
    limit: number;
    province?: string;
    result?: string;
    tripType?: string;
    visitType?: string;
    customerType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    slipStatus?: string;
    filterUserId?: string;
  }) {
    const { userId, role, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (role !== 'admin') where.userId = userId;
    else if (params.filterUserId) where.userId = params.filterUserId;
    if (params.province) where.province = params.province;
    if (params.result) where.result = params.result;
    if (params.tripType) where.tripType = params.tripType;
    if (params.slipStatus) where.slipStatus = params.slipStatus;
    if (params.visitType) where.visitType = params.visitType;
    if (params.customerType) where.customerType = params.customerType;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom.includes('T') ? params.dateFrom : params.dateFrom + "T00:00:00");
      if (params.dateTo) where.createdAt.lte = new Date(params.dateTo.includes('T') ? params.dateTo : params.dateTo + "T23:59:59");
    }
    if (params.search) {
      where.OR = [
        { shopName: { contains: params.search, mode: 'insensitive' } },
        { province: { contains: params.search, mode: 'insensitive' } },
        { user: { fullName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [data, allFiltered] = await Promise.all([
      this.prisma.visitRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { fullName: true, email: true } } },
      }),
      this.prisma.visitRecord.findMany({
        where,
        select: { result: true, orderAmount: true },
      }),
    ]);

    const stats = { total: allFiltered.length, buy: 0, noBuy: 0, notFound: 0, totalAmount: 0 };
    for (const r of allFiltered) {
      if (r.result === 'buy') { stats.buy++; stats.totalAmount += r.orderAmount ?? 0; }
      else if (r.result === 'no_buy') stats.noBuy++;
      else if (r.result === 'not_found') stats.notFound++;
    }

    return { data, total: stats.total, page, totalPages: Math.ceil(stats.total / limit), stats };
  }

  async getProvinceStats(params: { userId: string; role: string; dateFrom?: string; dateTo?: string }) {
    const where: any = {};
    if (params.role !== 'admin') where.userId = params.userId;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom.includes('T') ? params.dateFrom : params.dateFrom + "T00:00:00");
      if (params.dateTo) where.createdAt.lte = new Date(params.dateTo.includes('T') ? params.dateTo : params.dateTo + "T23:59:59");
    }

    const records = await this.prisma.visitRecord.findMany({
      where,
      select: { province: true, result: true, orderAmount: true },
    });

    const result: Record<string, { total: number; buy: number; noBuy: number; notFound: number; totalAmount: number }> = {};
    for (const r of records) {
      if (!result[r.province]) result[r.province] = { total: 0, buy: 0, noBuy: 0, notFound: 0, totalAmount: 0 };
      result[r.province].total++;
      if (r.result === 'buy') { result[r.province].buy++; result[r.province].totalAmount += r.orderAmount ?? 0; }
      else if (r.result === 'no_buy') result[r.province].noBuy++;
      else if (r.result === 'not_found') result[r.province].notFound++;
    }
    return result;
  }

  async getCommissionSummary(month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const dateFrom = new Date(year, monthNum - 1, 1);
    const dateTo = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const [slips, settings, prevPosAdjRows, allNegAdjRows, adjThisMonthRows, adjCarryoverRows] = await Promise.all([
      this.prisma.slipSubmission.findMany({
        where: {
          slipStatus: { in: ['verified', 'approved', 'pending_approval'] },
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: {
          userId: true,
          amount: true,
          debtDeducted: true,
          slipStatus: true,
          user: { select: { id: true, fullName: true, email: true, bankName: true, bankAccount: true } },
        },
      }),
      this.prisma.setting.findMany({
        where: { key: { in: ['commission_rate', 'commission_threshold', 'commission_tiers'] } },
      }),
      // ยอดช่วยยอดเดือนก่อนๆ (positive เท่านั้น, month < currentMonth) — ยอดที่ต้องหักคืน
      this.prisma.commissionAdjustment.groupBy({
        by: ['userId'],
        where: { month: { lt: month }, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      // ยอดหักคืนทั้งหมด (negative ทุก month) — สิ่งที่หักคืนไปแล้ว
      this.prisma.commissionAdjustment.groupBy({
        by: ['userId'],
        where: { amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      // ยอดเติมเดือนนี้ loan_help เท่านั้น (บวกเข้า commission formula)
      this.prisma.commissionAdjustment.groupBy({
        by: ['userId'],
        where: { month, amount: { gt: 0 }, type: 'loan_help' },
        _sum: { amount: true },
      }),
      // ยอดเติมยกมา loan_help NET (บวกลบรวม — เฉพาะ type loan_help เดือนก่อนๆ)
      this.prisma.commissionAdjustment.groupBy({
        by: ['userId'],
        where: { month: { lt: month }, type: 'loan_help' },
        _sum: { amount: true },
      }),
    ]);

    const settingMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const rate = parseFloat(settingMap['commission_rate'] || '0');
    const threshold = parseFloat(settingMap['commission_threshold'] || '0');
    const tiers = settingMap['commission_tiers'] ? JSON.parse(settingMap['commission_tiers']) : [];

    // ยอดค้างจากเดือนก่อน (เฉพาะ positive เดือนก่อน + negative ทุกเดือน)
    const prevPosMap = new Map<string, number>();
    for (const a of prevPosAdjRows) prevPosMap.set(a.userId, a._sum.amount ?? 0);
    const allNegMap = new Map<string, number>();
    for (const a of allNegAdjRows) allNegMap.set(a.userId, a._sum.amount ?? 0);
    const debtMap = new Map<string, number>();
    const allUserIds = new Set([...prevPosMap.keys(), ...allNegMap.keys()]);
    for (const uid of allUserIds) {
      const debt = Math.max(0, (prevPosMap.get(uid) ?? 0) + (allNegMap.get(uid) ?? 0));
      if (debt > 0) debtMap.set(uid, debt);
    }

    // ยอดเติมเดือนนี้ต่อ user
    const adjThisMonthMap = new Map<string, number>();
    for (const a of adjThisMonthRows) adjThisMonthMap.set(a.userId, a._sum.amount ?? 0);

    // ยอดเติมยกมาต่อ user
    const adjCarryoverMap = new Map<string, number>();
    for (const a of adjCarryoverRows) adjCarryoverMap.set(a.userId, a._sum.amount ?? 0);

    const userMap = new Map<string, { user: any; count: number; slipAmount: number; totalDeducted: number; pendingCount: number }>();
    for (const slip of slips) {
      if (!userMap.has(slip.userId)) {
        userMap.set(slip.userId, { user: slip.user, count: 0, slipAmount: 0, totalDeducted: 0, pendingCount: 0 });
      }
      const entry = userMap.get(slip.userId)!;
      if (slip.slipStatus === 'pending_approval') {
        entry.pendingCount++;
      } else {
        entry.count++;
        entry.slipAmount += (slip.amount ?? 0);           // gross — commission คำนวณจากยอดขายจริง
        entry.totalDeducted += (slip.debtDeducted ?? 0);  // หักคืนหนี้แยกต่างหาก
      }
    }

    // ดึง user info สำหรับ users ที่มี adjustment แต่ไม่มี slip เดือนนี้
    const missingUserIds = [...new Set([
      ...Array.from(adjThisMonthMap.keys()),
      ...Array.from(adjCarryoverMap.keys()),
    ])].filter((uid) => !userMap.has(uid));

    if (missingUserIds.length > 0) {
      const missingUsers = await this.prisma.user.findMany({
        where: { id: { in: missingUserIds } },
        select: { id: true, fullName: true, email: true, bankName: true, bankAccount: true },
      });
      for (const u of missingUsers) {
        userMap.set(u.id, { user: u, count: 0, slipAmount: 0, totalDeducted: 0, pendingCount: 0 });
      }
    }

    const summary = Array.from(userMap.entries())
      .map(([uid, { user, count, slipAmount, totalDeducted, pendingCount }]) => {
        const adjustThisMonth = adjThisMonthMap.get(uid) ?? 0;
        const adjustCarryover = adjCarryoverMap.get(uid) ?? 0;
        // commission คำนวณจาก net slips (gross - หักคืนค้าง) + ช่วยยอดเดือนนี้
        const totalAmount = slipAmount - totalDeducted + adjustThisMonth;
        const { reachedThreshold, commission } = calculateCommission({ totalAmount, rate, threshold, tiers });
        const outstandingDebt = debtMap.get(uid) ?? 0;
        return {
          userId: uid,
          user: { fullName: user.fullName, email: user.email, bankName: user.bankName, bankAccount: user.bankAccount },
          visitCount: count,
          slipAmount,          // ยอดสลิปรวม (gross)
          totalDeducted,       // ยอดที่หักคืนจากหนี้ผ่าน slip เดือนนี้
          adjustThisMonth,     // ยอดช่วยยอดเดือนนี้ (loan_help)
          adjustCarryover,     // ยอดยกมา (ใช้ดูเท่านั้น — ไม่นับ commission)
          totalAmount,         // ยอดคำนวณ = gross + ช่วยเดือนนี้
          outstandingDebt,
          reachedThreshold,
          commission,
          pendingCount,
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return { month, settings: { rate, threshold, tiers }, summary };
  }

  async getMyCommission(userId: string, month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const dateFrom = new Date(year, monthNum - 1, 1);
    const dateTo = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const [slips, settings, adjThisMonth, adjCarryover, prevPosResult, allNegResult] = await Promise.all([
      this.prisma.slipSubmission.findMany({
        where: {
          userId,
          slipStatus: { in: ['verified', 'approved', 'pending_approval'] },
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: { id: true, shopName: true, amount: true, debtDeducted: true, slipStatus: true, createdAt: true },
      }),
      this.prisma.setting.findMany({
        where: { key: { in: ['commission_rate', 'commission_threshold', 'commission_tiers'] } },
      }),
      // ยอดเติมเดือนนี้ loan_help เท่านั้น (บวกเข้า commission formula)
      this.prisma.commissionAdjustment.aggregate({
        where: { userId, month, amount: { gt: 0 }, type: 'loan_help' },
        _sum: { amount: true },
      }),
      // ยอดเติมยกมา loan_help NET (เฉพาะ type loan_help เดือนก่อนๆ)
      this.prisma.commissionAdjustment.aggregate({
        where: { userId, month: { lt: month }, type: 'loan_help' },
        _sum: { amount: true },
      }),
      // ยอดที่ต้องหักคืน (positive ทุก type, month < current)
      this.prisma.commissionAdjustment.aggregate({
        where: { userId, month: { lt: month }, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      // ยอดหักคืนทั้งหมด (negative ทุก month)
      this.prisma.commissionAdjustment.aggregate({
        where: { userId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
    ]);

    const settingMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const rate = parseFloat(settingMap['commission_rate'] || '0');
    const threshold = parseFloat(settingMap['commission_threshold'] || '0');
    const tiers = settingMap['commission_tiers'] ? JSON.parse(settingMap['commission_tiers']) : [];

    const confirmedSlips = slips.filter((s) => s.slipStatus !== 'pending_approval');
    const pendingSlips   = slips.filter((s) => s.slipStatus === 'pending_approval');

    // ยอดสลิปรวม (gross — commission คำนวณจากยอดขายจริง)
    const slipAmount    = confirmedSlips.reduce((s, v) => s + (v.amount ?? 0), 0);
    const totalDeducted = confirmedSlips.reduce((s, v) => s + (v.debtDeducted ?? 0), 0);
    const pendingAmount = pendingSlips.reduce((s, v) => s + (v.amount ?? 0), 0);

    const adjustThisMonth = adjThisMonth._sum.amount ?? 0;
    const adjustCarryover = adjCarryover._sum.amount ?? 0;

    // ยอดคำนวณ = net slips (gross - หักคืนค้าง) + ช่วยยอดเดือนนี้
    const totalAmount = slipAmount - totalDeducted + adjustThisMonth;

    // ยอดค้างจากเดือนก่อน = positive เดือนก่อน + negative ทั้งหมด
    const outstandingDebt = Math.max(0, (prevPosResult._sum.amount ?? 0) + (allNegResult._sum.amount ?? 0));

    const { reachedThreshold, commission, remaining, breakdown } = calculateCommission({ totalAmount, rate, threshold, tiers });

    return {
      month, visitCount: slips.length,
      slipAmount,           // ยอดสลิปรวม (gross)
      totalDeducted,        // ยอดที่หักคืนหนี้ผ่าน slip
      adjustThisMonth,      // ยอดช่วยยอดเดือนนี้ (loan_help)
      adjustCarryover,      // ยอดยกมา (ใช้ดูเท่านั้น)
      totalAmount,          // ยอดคำนวณ = gross + ช่วยเดือนนี้
      pendingAmount,
      confirmedCount: confirmedSlips.length, pendingCount: pendingSlips.length,
      outstandingDebt,
      reachedThreshold, commission, remaining, breakdown, settings: { rate, threshold, tiers },
    };
  }

  async getCommissionBreakdown(params: { userId: string; month: string }) {
    const [year, monthNum] = params.month.split('-').map(Number);
    const dateFrom = new Date(year, monthNum - 1, 1);
    const dateTo = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const slips = await this.prisma.slipSubmission.findMany({
      where: {
        userId: params.userId,
        slipStatus: { in: ['verified', 'approved'] },
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true, shopName: true, amount: true, debtDeducted: true,
        slipUrl: true, slipStatus: true, transRef: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return slips.map((s) => ({ ...s, orderAmount: s.amount, netAmount: (s.amount ?? 0) - (s.debtDeducted ?? 0) }));
  }

  async approveVisit(params: {
    id: string;
    action: 'approve' | 'reject';
    amount?: number;
    adminId: string;
    role: string;
  }) {
    if (params.role !== 'admin') throw new Error('Forbidden');

    const visit = await this.prisma.visitRecord.findUnique({
      where: { id: params.id },
      include: { user: { select: { email: true, fullName: true } } },
    });
    if (!visit) throw new Error('Visit not found');
    if (visit.slipStatus !== 'pending_approval') throw new Error('Visit is not pending approval');

    const finalAmount = params.action === 'approve' && params.amount != null ? params.amount : visit.orderAmount;

    const updated = await this.prisma.visitRecord.update({
      where: { id: params.id },
      data: {
        slipStatus: params.action === 'approve' ? 'approved' : 'rejected',
        orderAmount: finalAmount,
        approvedBy: params.adminId,
        approvedAt: new Date(),
      },
    });

    if (params.action === 'approve') {
      const sheetSetting = await this.prisma.setting.findUnique({ where: { key: 'commission_sheet_id' } });
      const sheetId = sheetSetting?.value;
      if (sheetId) {
        const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const customerLabel = visit.customerType === 'new' ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า';
        await this.googleService.appendToSheetById(
          sheetId,
          [
            now,
            visit.user?.email || '',
            visit.slipUrl || '',
            visit.details || '',
            visit.province || '',
            visit.shopName || '',
            String(finalAmount ?? 0),
            customerLabel,
          ],
          ['ประทับเวลา', 'ที่อยู่อีเมล', 'สลิปธนาคาร', 'หมายเหตุ (ถ้ามี)', 'จังหวัด', 'ชื่อร้าน', 'ยอดเงิน (บาท)', 'ลูกค้า'],
        );
      }
    }

    return updated;
  }

  async deleteVisit(id: string, userId: string, role: string) {
    const visit = await this.prisma.visitRecord.findUnique({ where: { id } });
    if (!visit) throw new Error('Visit not found');
    if (role !== 'admin' && visit.userId !== userId) throw new Error('Forbidden');
    const imageUrls: string[] = (visit as any).imageUrls ?? [];
    for (const url of imageUrls) {
      try {
        const filename = url.split('/').pop();
        if (filename) {
          const filepath = path.join(process.cwd(), 'uploads', 'line', filename);
          const fs = require('fs');
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        }
      } catch (e) { this.logger.warn(`Failed to delete image: ${(e as Error).message}`); }
    }
    await this.prisma.visitRecord.delete({ where: { id } });
    return { success: true };
  }

  async updateVisit(id: string, userId: string, role: string, data: {
    shopName?: string;
    result?: string;
    orderAmount?: number | null;
    details?: string;
  }) {
    const visit = await this.prisma.visitRecord.findUnique({ where: { id } });
    if (!visit) throw new Error('Visit not found');
    if (role !== 'admin' && visit.userId !== userId) throw new Error('Forbidden');
    return this.prisma.visitRecord.update({
      where: { id },
      data: {
        ...(data.shopName !== undefined ? { shopName: data.shopName } : {}),
        ...(data.result !== undefined ? { result: data.result } : {}),
        ...(data.orderAmount !== undefined ? { orderAmount: data.orderAmount } : {}),
        ...(data.details !== undefined ? { details: data.details } : {}),
      },
    });
  }
}

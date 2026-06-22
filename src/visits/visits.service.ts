import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';
import { GoogleService } from '../google/google.service';

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
    const slotKeys = ['front1', 'front2', 'inside1', 'inside2', 'line', 'xray'];
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
      await this.googleService.ensureSheetHeader();
      await this.googleService.appendVisitRow([
        now,                                                    // ประทับเวลา
        params.userEmail,                                       // ที่อยู่อีเมล
        params.tripType ? tripMap[params.tripType] : '',        // ทริป
        params.visitType ? missionMap[params.visitType] : '',   // ภารกิจ
        customerLabel,                                          // ลูกค้า
        params.shopName,                                        // ชื่อร้าน
        mapsUrl,                                                // Link Google Maps
        params.province,                                        // จังหวัด
        params.district || '',                                  // (*สำหรับกทม.*)
        params.result ? resultMap[params.result] : '',          // ผลตอบรับ
        slotUrls['line'] || '',                                 // Line OA (1 รูป)
        slotUrls['front1'] || '',                               // รูปหน้าร้าน (1รูป)
        slotUrls['inside1'] || '',                              // รูปในร้าน (1รูป)
        params.details || '',                                   // สรุปผล
        slotUrls['xray'] || '',                                 // ใบ X-Ray ส่ง (1รูป)
      ]);
    } catch (e) {
      this.logger.warn(`Google Sheets append failed: ${e.message}`);
    }

    // Send to LINE Group
    const lineResult = await this.lineService.sendToGroups({
      senderId: params.userId,
      files: params.files,
      targetUserIds: [params.userId],
      title: params.shopName,
      price: '',
      note: noteParts,
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
  }) {
    const { userId, role, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (role !== 'admin') where.userId = userId;
    if (params.province) where.province = params.province;
    if (params.result) where.result = params.result;
    if (params.tripType) where.tripType = params.tripType;
    if (params.slipStatus) where.slipStatus = params.slipStatus;
    if (params.visitType) where.visitType = params.visitType;
    if (params.customerType) where.customerType = params.customerType;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
      if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
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
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
      if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
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

    const [visits, settings] = await Promise.all([
      this.prisma.visitRecord.findMany({
        where: {
          result: 'buy',
          slipStatus: { in: ['verified', 'approved'] },
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: {
          userId: true,
          orderAmount: true,
          user: { select: { id: true, fullName: true, email: true, bankName: true, bankAccount: true } },
        },
      }),
      this.prisma.setting.findMany({
        where: { key: { in: ['commission_rate', 'commission_threshold'] } },
      }),
    ]);

    const settingMap = Object.fromEntries(settings.map((s) => [s.key, parseFloat(s.value || '0')]));
    const rate = settingMap['commission_rate'] ?? 0;
    const threshold = settingMap['commission_threshold'] ?? 0;

    const userMap = new Map<string, { user: any; count: number; totalAmount: number }>();
    for (const visit of visits) {
      if (!userMap.has(visit.userId)) {
        userMap.set(visit.userId, { user: visit.user, count: 0, totalAmount: 0 });
      }
      const entry = userMap.get(visit.userId)!;
      entry.count++;
      entry.totalAmount += visit.orderAmount ?? 0;
    }

    const summary = Array.from(userMap.values())
      .map(({ user, count, totalAmount }) => {
        const reachedThreshold = threshold === 0 || totalAmount >= threshold;
        const commission = reachedThreshold ? Math.round(totalAmount * rate) / 100 : 0;
        return { userId: user.id, user: { fullName: user.fullName, email: user.email, bankName: user.bankName, bankAccount: user.bankAccount }, visitCount: count, totalAmount, reachedThreshold, commission };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return { month, settings: { rate, threshold }, summary };
  }

  async getMyCommission(userId: string, month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const dateFrom = new Date(year, monthNum - 1, 1);
    const dateTo = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const [visits, settings] = await Promise.all([
      this.prisma.visitRecord.findMany({
        where: {
          userId,
          result: 'buy',
          slipStatus: { in: ['verified', 'approved', 'pending_approval'] },
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: { id: true, shopName: true, orderAmount: true, slipStatus: true, createdAt: true },
      }),
      this.prisma.setting.findMany({
        where: { key: { in: ['commission_rate', 'commission_threshold'] } },
      }),
    ]);

    const settingMap = Object.fromEntries(settings.map((s) => [s.key, parseFloat(s.value || '0')]));
    const rate = settingMap['commission_rate'] ?? 0;
    const threshold = settingMap['commission_threshold'] ?? 0;
    const totalAmount = visits.reduce((s, v) => s + (v.orderAmount ?? 0), 0);
    const reachedThreshold = threshold === 0 || totalAmount >= threshold;
    const commission = reachedThreshold ? Math.round(totalAmount * rate) / 100 : 0;
    const remaining = reachedThreshold ? 0 : threshold - totalAmount;

    return { month, visitCount: visits.length, totalAmount, reachedThreshold, commission, remaining, settings: { rate, threshold } };
  }

  async getCommissionBreakdown(params: { userId: string; month: string }) {
    const [year, monthNum] = params.month.split('-').map(Number);
    const dateFrom = new Date(year, monthNum - 1, 1);
    const dateTo = new Date(year, monthNum, 0, 23, 59, 59, 999);

    return this.prisma.visitRecord.findMany({
      where: {
        userId: params.userId,
        result: 'buy',
        slipStatus: { in: ['verified', 'approved'] },
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true, shopName: true, province: true, district: true,
        orderAmount: true, slipUrl: true, slipStatus: true, transRef: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveVisit(params: {
    id: string;
    action: 'approve' | 'reject';
    amount?: number;
    adminId: string;
    role: string;
  }) {
    if (params.role !== 'admin') throw new Error('Forbidden');

    const visit = await this.prisma.visitRecord.findUnique({ where: { id: params.id } });
    if (!visit) throw new Error('Visit not found');
    if (visit.slipStatus !== 'pending_approval') throw new Error('Visit is not pending approval');

    return this.prisma.visitRecord.update({
      where: { id: params.id },
      data: {
        slipStatus: params.action === 'approve' ? 'approved' : 'rejected',
        orderAmount: params.action === 'approve' && params.amount != null ? params.amount : visit.orderAmount,
        approvedBy: params.adminId,
        approvedAt: new Date(),
      },
    });
  }
}

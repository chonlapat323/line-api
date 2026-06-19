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
        '',                                                     // (*สำหรับทบทวน*)
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

  async findByUser(userId: string, role: string) {
    const where = role === 'admin' ? {} : { userId };
    return this.prisma.visitRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { fullName: true, email: true } },
      },
    });
  }
}

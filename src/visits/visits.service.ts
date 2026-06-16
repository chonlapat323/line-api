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
    userFullName: string;
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
        imageUrls,
      },
    });

    const tripMap: Record<string, string> = {
      plan: 'ตามแผน', off_plan: 'นอกแผน', swap: 'สลับวัน',
    };
    const missionMap: Record<string, string> = { tak: 'ทัก', dem: 'เดม' };
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

    // Upload images to Google Drive
    const driveLinks: Record<string, string> = {};
    const slotKeys = ['line', 'front', 'inside', 'xray'];
    for (const file of params.files) {
      const slotKey = slotKeys.find((k) => file.originalname.startsWith(k + '-'));
      if (!slotKey) continue;
      try {
        const filePath = path.join(process.cwd(), 'uploads', 'line', file.filename);
        const link = await this.googleService.uploadFileToDrive(filePath, file.originalname, file.mimetype);
        driveLinks[slotKey] = link;
      } catch (e) {
        this.logger.warn(`Drive upload failed for ${file.originalname}: ${e.message}`);
      }
    }

    // Append row to Google Sheet
    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    try {
      await this.googleService.ensureSheetHeader();
      await this.googleService.appendVisitRow([
        now,
        params.userFullName,
        params.shopName,
        params.province,
        params.district || '',
        params.tripType ? tripMap[params.tripType] : '',
        customerLabel,
        params.visitType ? missionMap[params.visitType] : '',
        params.result ? resultMap[params.result] : '',
        params.details || '',
        driveLinks['line'] || '',
        driveLinks['front'] || '',
        driveLinks['inside'] || '',
        driveLinks['xray'] || '',
        String(params.latitude),
        String(params.longitude),
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

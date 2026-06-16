import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';

@Injectable()
export class VisitsService {
  constructor(
    private prisma: PrismaService,
    private lineService: LineService,
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

    const locationLabel = params.district
      ? `${params.province} เขต${params.district}`
      : params.province;

    const tripMap: Record<string, string> = {
      plan: 'ตามแผน', off_plan: 'นอกแผน', swap: 'สลับวัน',
    };
    const missionMap: Record<string, string> = { tak: 'ทัก', dem: 'เดม' };
    const resultMap: Record<string, string> = { buy: 'ซื้อ', no_buy: 'ไม่ซื้อ', not_found: 'ไม่พบ' };
    const customerLabel = params.customerType === 'new' ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า';

    const noteParts = [
      locationLabel,
      params.tripType ? tripMap[params.tripType] : '',
      customerLabel,
      params.visitType ? missionMap[params.visitType] : '',
      params.result ? `ผล: ${resultMap[params.result]}` : '',
      params.details,
    ].filter(Boolean).join(' · ');

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

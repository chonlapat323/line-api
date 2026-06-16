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
    customerType: string;
    visitType: string;
    details: string;
  }) {
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const imageUrls = params.files.map((f) => `${appUrl}/uploads/visits/${f.filename}`);

    // Save visit record
    const record = await this.prisma.visitRecord.create({
      data: {
        userId: params.userId,
        shopName: params.shopName,
        province: params.province,
        district: params.district || null,
        latitude: params.latitude,
        longitude: params.longitude,
        customerType: params.customerType,
        visitType: params.visitType || null,
        details: params.details || null,
        imageUrls,
      },
    });

    // Build LINE note from visit context
    const locationLabel = params.district
      ? `${params.province} เขต${params.district}`
      : params.province;

    const customerLabel =
      params.customerType === 'new' ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า';

    const visitTypeMap: Record<string, string> = {
      visit: 'เยี่ยมเยือน',
      order: 'จดยอด',
      delivery: 'เด็มงาน',
    };
    const visitLabel = params.visitType ? visitTypeMap[params.visitType] : '';

    const noteParts = [locationLabel, customerLabel, visitLabel, params.details]
      .filter(Boolean)
      .join(' · ');

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

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string) {
    const s = await this.prisma.setting.findUnique({ where: { key } });
    return s?.value ?? null;
  }

  async set(key: string, value: string) {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getPublicSettings() {
    const botId = await this.get('LINE_BOT_ID');
    return { lineBotId: botId };
  }
}

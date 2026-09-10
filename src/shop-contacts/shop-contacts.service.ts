import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FlowAccountService } from '../flowaccount/flowaccount.service';

@Injectable()
export class ShopContactsService {
  private readonly logger = new Logger(ShopContactsService.name);

  constructor(
    private prisma: PrismaService,
    private flowAccount: FlowAccountService,
  ) {}

  async syncFromFlowAccount() {
    const contacts = await this.flowAccount.listAllContacts();

    let upserted = 0;
    for (const c of contacts) {
      await this.prisma.shopContact.upsert({
        where: { flowAccountContactId: c.contactId },
        update: { contactName: c.contactName },
        create: { flowAccountContactId: c.contactId, contactName: c.contactName },
      });
      upserted++;
    }

    this.logger.log(`[syncFromFlowAccount] synced ${upserted} contacts`);
    return { synced: upserted };
  }

  async search(query: string) {
    const q = query.trim();
    if (!q) return [];
    return this.prisma.shopContact.findMany({
      where: { contactName: { contains: q, mode: 'insensitive' } },
      select: { id: true, contactName: true },
      orderBy: { contactName: 'asc' },
      take: 20,
    });
  }

  async getStatus() {
    const [count, latest] = await Promise.all([
      this.prisma.shopContact.count(),
      this.prisma.shopContact.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    return { count, lastSyncedAt: latest?.updatedAt ?? null };
  }
}

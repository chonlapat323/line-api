import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function maskedToLikePattern(masked: string): string {
  return masked.replace(/-/g, '').replace(/[xX]/g, '%');
}

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.allowedBankAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: { label: string; bankId: string; bankName: string; accountNumber: string }) {
    return this.prisma.allowedBankAccount.create({ data });
  }

  update(id: string, data: { label?: string; bankId?: string; bankName?: string; accountNumber?: string; isActive?: boolean }) {
    return this.prisma.allowedBankAccount.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.allowedBankAccount.delete({ where: { id } });
  }

  async checkReceiver(bankId: string, accountMasked: string): Promise<boolean> {
    const pattern = maskedToLikePattern(accountMasked);
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "AllowedBankAccount"
      WHERE "isActive" = true
        AND "bankId" = ${bankId}
        AND REPLACE("accountNumber", '-', '') LIKE ${pattern}
      LIMIT 1
    `;
    return result.length > 0;
  }
}

import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LineModule } from '../line/line.module';
import { GoogleModule } from '../google/google.module';
import { SlipModule } from '../slip/slip.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { ShopContactsModule } from '../shop-contacts/shop-contacts.module';

@Module({
  imports: [PrismaModule, LineModule, GoogleModule, SlipModule, BankAccountsModule, ShopContactsModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}

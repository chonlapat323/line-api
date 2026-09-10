import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LineModule } from './line/line.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { VisitsModule } from './visits/visits.module';
import { GoogleModule } from './google/google.module';
import { CommissionPaymentsModule } from './commission-payments/commission-payments.module';
import { CommissionAdjustmentsModule } from './commission-adjustments/commission-adjustments.module';
import { RolesModule } from './roles/roles.module';
import { SlipsModule } from './slips/slips.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { FlowAccountModule } from './flowaccount/flowaccount.module';
import { ShopContactsModule } from './shop-contacts/shop-contacts.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, LineModule, SettingsModule, VisitsModule, GoogleModule, CommissionPaymentsModule, CommissionAdjustmentsModule, RolesModule, SlipsModule, BankAccountsModule, FlowAccountModule, ShopContactsModule],
})
export class AppModule {}

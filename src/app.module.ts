import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LineModule } from './line/line.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { VisitsModule } from './visits/visits.module';
import { GoogleModule } from './google/google.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, LineModule, SettingsModule, VisitsModule, GoogleModule],
})
export class AppModule {}

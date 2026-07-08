import { Module } from '@nestjs/common';
import { SlipsController } from './slips.controller';
import { SlipsService } from './slips.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LineModule } from '../line/line.module';
import { CommissionAdjustmentsModule } from '../commission-adjustments/commission-adjustments.module';

@Module({
  imports: [PrismaModule, LineModule, CommissionAdjustmentsModule],
  controllers: [SlipsController],
  providers: [SlipsService],
})
export class SlipsModule {}

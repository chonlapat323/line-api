import { Module } from '@nestjs/common';
import { CommissionAdjustmentsService } from './commission-adjustments.service';
import { CommissionAdjustmentsController } from './commission-adjustments.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommissionAdjustmentsController],
  exports: [CommissionAdjustmentsService],
  providers: [CommissionAdjustmentsService],
})
export class CommissionAdjustmentsModule {}

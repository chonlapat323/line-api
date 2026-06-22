import { Module } from '@nestjs/common';
import { CommissionPaymentsController } from './commission-payments.controller';
import { CommissionPaymentsService } from './commission-payments.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommissionPaymentsController],
  providers: [CommissionPaymentsService],
})
export class CommissionPaymentsModule {}

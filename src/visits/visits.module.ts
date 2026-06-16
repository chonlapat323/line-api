import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LineModule } from '../line/line.module';

@Module({
  imports: [PrismaModule, LineModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}

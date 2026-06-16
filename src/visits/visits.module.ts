import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LineModule } from '../line/line.module';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [PrismaModule, LineModule, GoogleModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}

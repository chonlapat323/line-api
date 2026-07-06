import { Module } from '@nestjs/common';
import { SlipsController } from './slips.controller';
import { SlipsService } from './slips.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LineModule } from '../line/line.module';

@Module({
  imports: [PrismaModule, LineModule],
  controllers: [SlipsController],
  providers: [SlipsService],
})
export class SlipsModule {}

import { Module } from '@nestjs/common';
import { FlowAccountService } from './flowaccount.service';
import { FlowAccountController } from './flowaccount.controller';

@Module({
  controllers: [FlowAccountController],
  providers: [FlowAccountService],
  exports: [FlowAccountService],
})
export class FlowAccountModule {}

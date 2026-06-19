import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SlipService } from './slip.service';
import { Slip2GoStrategy } from './strategies/slip2go.strategy';
import { EasySlipStrategy } from './strategies/easyslip.strategy';

@Module({
  imports: [SettingsModule],
  providers: [SlipService, Slip2GoStrategy, EasySlipStrategy],
  exports: [SlipService],
})
export class SlipModule {}

import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { Slip2GoStrategy } from './strategies/slip2go.strategy';
import { EasySlipStrategy } from './strategies/easyslip.strategy';
import { SlipVerifyResult } from './slip-strategy.interface';

@Injectable()
export class SlipService {
  constructor(
    private readonly settings: SettingsService,
    private readonly slip2go: Slip2GoStrategy,
    private readonly easyslip: EasySlipStrategy,
  ) {}

  async verify(imageBuffer: Buffer, filename: string): Promise<SlipVerifyResult> {
    const provider = (await this.settings.get('slip_provider')) ?? 'slip2go';
    const strategy = provider === 'easyslip' ? this.easyslip : this.slip2go;
    return strategy.verify(imageBuffer, filename);
  }
}

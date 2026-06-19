import { Injectable } from '@nestjs/common';
import { ISlipStrategy, SlipVerifyResult } from '../slip-strategy.interface';

// Placeholder — implement when EasySlip API key is ready
@Injectable()
export class EasySlipStrategy implements ISlipStrategy {
  async verify(_imageBuffer: Buffer, _filename: string): Promise<SlipVerifyResult> {
    return { success: false, raw: { error: 'EasySlip not yet implemented' } };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SettingsService } from '../../settings/settings.service';
import { ISlipStrategy, SlipVerifyResult } from '../slip-strategy.interface';

@Injectable()
export class Slip2GoStrategy implements ISlipStrategy {
  private readonly logger = new Logger(Slip2GoStrategy.name);
  private readonly BASE_URL = 'https://connect.slip2go.com';

  constructor(private readonly settings: SettingsService) {}

  async verify(imageBuffer: Buffer, filename: string): Promise<SlipVerifyResult> {
    const secret = await this.settings.get('slip2go_secret');
    if (!secret) {
      this.logger.warn('slip2go_secret not configured — skipping verify');
      return { success: false, raw: { error: 'slip2go_secret not configured' } };
    }

    const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const imageBase64 = `data:${mime};base64,${imageBuffer.toString('base64')}`;
    const base64Kb = Math.round(imageBase64.length / 1024);

    this.logger.log(`[Slip2Go] verify start: file=${filename} buffer=${imageBuffer.length}B base64=${base64Kb}KB`);

    try {
      const { data: res, status } = await axios.post(
        `${this.BASE_URL}/api/verify-slip/qr-base64/info`,
        { payload: { imageBase64 } },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`,
          },
          timeout: 15000,
        },
      );

      this.logger.log(`[Slip2Go] HTTP ${status} | code=${res?.code} | message=${res?.message ?? '-'} | hasData=${!!res?.data}`);

      if (res.code !== '200000' || !res.data) {
        this.logger.warn(`[Slip2Go] no QR found | code=${res.code} | message=${res.message ?? '-'} | raw=${JSON.stringify(res).slice(0, 500)}`);
        return { success: false, raw: res };
      }

      const d = res.data;
      this.logger.log(`[Slip2Go] QR ok | transRef=${d.transRef} | amount=${d.amount} | sender=${d.sender?.account?.name ?? '-'}`);
      return {
        success: true,
        amount: d.amount,
        transRef: d.transRef,
        senderName: d.sender?.account?.name,
        senderBank: d.sender?.bank?.name,
        receiverName: d.receiver?.account?.name,
        receiverBank: d.receiver?.bank?.name,
        paidAt: d.dateTime,
        raw: d,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const errData = err?.response?.data ?? err?.message;
      this.logger.error(`[Slip2Go] request failed | HTTP ${status ?? '?'} | body=${JSON.stringify(errData).slice(0, 500)}`);
      return { success: false, raw: errData };
    }
  }
}

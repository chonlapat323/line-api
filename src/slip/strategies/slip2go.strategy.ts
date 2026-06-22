import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { SettingsService } from '../../settings/settings.service';
import { ISlipStrategy, SlipVerifyResult } from '../slip-strategy.interface';

@Injectable()
export class Slip2GoStrategy implements ISlipStrategy {
  private readonly logger = new Logger(Slip2GoStrategy.name);
  private readonly BASE_URL = 'https://app.slip2go.com';

  constructor(private readonly settings: SettingsService) {}

  async verify(imageBuffer: Buffer, filename: string): Promise<SlipVerifyResult> {
    const secret = await this.settings.get('slip2go_secret');
    if (!secret) {
      this.logger.warn('slip2go_secret not configured — skipping verify');
      return { success: false, raw: { error: 'slip2go_secret not configured' } };
    }

    this.logger.log(`Verifying slip: ${filename} (${imageBuffer.length} bytes)`);

    const form = new FormData();
    form.append('file', imageBuffer, { filename, contentType: 'image/jpeg' });

    try {
      const { data: res } = await axios.post(
        `${this.BASE_URL}/api/verify-slip/qr-image/info`,
        form,
        { headers: { ...form.getHeaders(), Authorization: `Bearer ${secret}` } },
      );

      this.logger.log(`Slip2Go response: code=${res.code} hasData=${!!res.data}`);

      if (res.code !== '200000' || !res.data) {
        this.logger.warn(`Slip2Go no QR: code=${res.code} message=${res.message ?? '-'}`);
        return { success: false, raw: res };
      }

      const d = res.data;
      this.logger.log(`Slip2Go QR ok: transRef=${d.transRef} amount=${d.amount}`);
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
      const errData = err?.response?.data ?? err?.message;
      this.logger.error(`Slip2Go request failed: ${JSON.stringify(errData)}`);
      return { success: false, raw: errData };
    }
  }
}

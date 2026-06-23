import { Controller, Get, Body, Patch, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getPublic() {
    return this.settingsService.getPublicSettings();
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  update(@Body() body: { lineBotId: string }) {
    return this.settingsService.set('LINE_BOT_ID', body.lineBotId);
  }

  @Get('slip')
  @UseGuards(JwtAuthGuard)
  async getSlipSettings() {
    const provider = await this.settingsService.get('slip_provider');
    const hasSlip2GoSecret = !!(await this.settingsService.get('slip2go_secret'));
    const hasEasySlipSecret = !!(await this.settingsService.get('easyslip_secret'));
    return { provider: provider || 'slip2go', hasSlip2GoSecret, hasEasySlipSecret };
  }

  @Patch('slip')
  @UseGuards(JwtAuthGuard)
  async updateSlipSettings(
    @Body() body: { provider?: string; slip2goSecret?: string; easyslipSecret?: string },
  ) {
    if (body.provider) await this.settingsService.set('slip_provider', body.provider);
    if (body.slip2goSecret) await this.settingsService.set('slip2go_secret', body.slip2goSecret);
    if (body.easyslipSecret) await this.settingsService.set('easyslip_secret', body.easyslipSecret);
    return { ok: true };
  }

  @Get('commission')
  @UseGuards(JwtAuthGuard)
  async getCommissionSettings() {
    const rate = await this.settingsService.get('commission_rate');
    const threshold = await this.settingsService.get('commission_threshold');
    return {
      rate: parseFloat(rate || '0'),
      threshold: parseFloat(threshold || '0'),
    };
  }

  @Patch('commission')
  @UseGuards(JwtAuthGuard)
  async updateCommissionSettings(
    @Body() body: { rate?: number; threshold?: number },
  ) {
    if (body.rate != null) await this.settingsService.set('commission_rate', String(body.rate));
    if (body.threshold != null) await this.settingsService.set('commission_threshold', String(body.threshold));
    return { ok: true };
  }

  @Get('sheets')
  @UseGuards(JwtAuthGuard)
  async getSheetSettings() {
    const visitSheetId     = await this.settingsService.get('visit_sheet_id');
    const commissionSheetId = await this.settingsService.get('commission_sheet_id');
    return {
      visitSheetId:      visitSheetId      || process.env.GOOGLE_SHEET_ID || '',
      commissionSheetId: commissionSheetId || '',
    };
  }

  @Patch('sheets')
  @UseGuards(JwtAuthGuard)
  async updateSheetSettings(
    @Body() body: { visitSheetId?: string; commissionSheetId?: string },
  ) {
    if (body.visitSheetId      !== undefined) await this.settingsService.set('visit_sheet_id',      body.visitSheetId);
    if (body.commissionSheetId !== undefined) await this.settingsService.set('commission_sheet_id', body.commissionSheetId);
    return { ok: true };
  }
}

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
}

import { Controller, Post, Get, Query, UseGuards } from '@nestjs/common';
import { ShopContactsService } from './shop-contacts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('shop-contacts')
export class ShopContactsController {
  constructor(private readonly shopContactsService: ShopContactsService) {}

  // Autocomplete — any logged-in user (sales reps included) can search.
  @Get('search')
  @UseGuards(JwtAuthGuard)
  search(@Query('q') q: string) {
    return this.shopContactsService.search(q || '');
  }

  // Admin-only: pull the latest contact list from FlowAccount.
  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles({ menu: 'settings', action: 'canEdit' })
  sync() {
    return this.shopContactsService.syncFromFlowAccount();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles({ menu: 'settings', action: 'canView' })
  status() {
    return this.shopContactsService.getStatus();
  }
}

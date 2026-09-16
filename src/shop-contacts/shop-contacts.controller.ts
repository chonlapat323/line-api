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

  // Exact-match check — mobile calls this before showing the "new shop, add it?" popup.
  @Get('exists')
  @UseGuards(JwtAuthGuard)
  async exists(@Query('name') name: string) {
    return { exists: await this.shopContactsService.exists(name || '') };
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles({ menu: 'settings', action: 'canView' })
  list() {
    return this.shopContactsService.list();
  }
}

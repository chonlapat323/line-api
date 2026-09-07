import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('bank-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles({ menu: 'settings', action: 'canEdit' })
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: { label: string; bankId: string; bankName: string; accountNumber: string }) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { label?: string; bankId?: string; bankName?: string; accountNumber?: string; isActive?: boolean },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

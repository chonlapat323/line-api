import { Controller, Get, Post, Body, Query, Param, Request, UseGuards } from '@nestjs/common';
import { CommissionAdjustmentsService } from './commission-adjustments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('commission-adjustments')
@UseGuards(JwtAuthGuard)
export class CommissionAdjustmentsController {
  constructor(private readonly service: CommissionAdjustmentsService) {}

  @Post()
  create(
    @Body() body: { userId: string; month: string; amount: number; note?: string; type?: string },
    @Request() req: any,
  ) {
    return this.service.create({ ...body, createdBy: req.user.id });
  }

  @Post('apply-debt')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canEdit' })
  applyDebt(
    @Body() body: { userId: string; month: string },
    @Request() req: any,
  ) {
    return this.service.applyDebtToExistingSlips(body.userId, req.user.id, body.month)
      .then((applied) => ({ applied }));
  }

  @Get('outstanding')
  getOutstandingDebtAll() {
    return this.service.getOutstandingDebtAll();
  }

  @Get('me/outstanding')
  async getMyOutstanding(@Request() req: any) {
    const outstandingDebt = await this.service.getOutstandingDebt(req.user.id);
    return { outstandingDebt };
  }

  @Get()
  findByMonth(@Query('month') month: string) {
    return this.service.findByMonth(month);
  }

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.service.findByUser(userId);
  }
}

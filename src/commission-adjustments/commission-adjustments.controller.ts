import { Controller, Get, Post, Body, Query, Param, Request, UseGuards } from '@nestjs/common';
import { CommissionAdjustmentsService } from './commission-adjustments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('commission-adjustments')
@UseGuards(JwtAuthGuard)
export class CommissionAdjustmentsController {
  constructor(private readonly service: CommissionAdjustmentsService) {}

  @Post()
  create(
    @Body() body: { userId: string; month: string; amount: number; note?: string },
    @Request() req: any,
  ) {
    return this.service.create({ ...body, createdBy: req.user.id });
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

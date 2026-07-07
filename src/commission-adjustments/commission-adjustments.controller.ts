import { Controller, Get, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
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
    return this.service.create({ ...body, createdBy: req.user.userId });
  }

  @Get()
  findByMonth(@Query('month') month: string) {
    return this.service.findByMonth(month);
  }
}

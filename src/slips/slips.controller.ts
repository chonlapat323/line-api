import { Controller, Post, Get, Patch, Body, Param, Request, UseGuards } from '@nestjs/common';
import { SlipsService } from './slips.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('slips')
@UseGuards(JwtAuthGuard)
export class SlipsController {
  constructor(private readonly slipsService: SlipsService) {}

  @Post()
  submit(
    @Body() body: {
      shopName: string;
      amount?: string;
      details?: string;
      slipUrl: string;
      slipStatus: string;
      transRef?: string;
    },
    @Request() req,
  ) {
    return this.slipsService.submit({
      userId: req.user.id,
      shopName: body.shopName,
      amount: body.amount ? parseFloat(body.amount) : null,
      details: body.details || '',
      slipUrl: body.slipUrl,
      slipStatus: body.slipStatus,
      transRef: body.transRef || '',
    });
  }

  @Get()
  findAll(@Request() req) {
    return this.slipsService.findAll(req.user.id, req.user.role);
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canEdit' })
  approve(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; amount?: number },
    @Request() req,
  ) {
    return this.slipsService.approve({
      id,
      action: body.action,
      amount: body.amount,
      adminId: req.user.id,
    });
  }
}

import { Controller, Post, Get, Patch, Body, Param, Query, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { SlipsService } from './slips.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { parseAmount } from '../common/parse-amount.util';

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
      province?: string;
      district?: string;
      isProxy?: boolean;
      isReceiverBlocked?: boolean;
      receiverBankId?: string;
      receiverAccountMasked?: string;
    },
    @Request() req,
  ) {
    return this.slipsService.submit({
      userId: req.user.id,
      shopName: body.shopName,
      amount: parseAmount(body.amount),
      details: body.details || '',
      slipUrl: body.slipUrl,
      slipStatus: body.slipStatus,
      transRef: body.transRef || '',
      province: body.province || '',
      district: body.district || '',
      isProxy: body.isProxy ?? false,
      isReceiverBlocked: body.isReceiverBlocked ?? false,
      receiverBankId: body.receiverBankId || null,
      receiverAccountMasked: body.receiverAccountMasked || null,
    });
  }

  @Get()
  findAll(@Request() req, @Query() q: any) {
    return this.slipsService.findAll({
      userId: req.user.id,
      role: req.user.role,
      roleId: req.user.roleId,
      filterUserId: q.filterUserId,
      status: q.status,
      blocked: q.blocked,
      search: q.search,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
    });
  }

  @Get('proxy-commission')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'commissions', action: 'canView' })
  getProxyCommission(@Query() q: { month?: string }) {
    const month = q.month || new Date().toISOString().slice(0, 7);
    return this.slipsService.getProxyCommission({ month });
  }

  @Patch(':id/proxy')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canEdit' })
  toggleProxy(
    @Param('id') id: string,
    @Body() body: { isProxy: boolean },
    @Request() req,
  ) {
    return this.slipsService.toggleProxy({
      id,
      isProxy: body.isProxy,
      requesterId: req.user.id,
      requesterRole: req.user.role,
    });
  }

  @Patch(':id/unblock')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canEdit' })
  unblock(@Param('id') id: string, @Request() req) {
    return this.slipsService.unblock(id, req.user.id);
  }

  @Get('hashes')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canView' })
  getSlipHashes(@Query() q: any) {
    return this.slipsService.getSlipHashes({
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 30,
      search: q.search,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  @Get('duplicate-logs')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canView' })
  getDuplicateLogs(@Query() q: any) {
    return this.slipsService.getDuplicateLogs({
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 30,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  @Get('audit-logs')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canView' })
  getAuditLogs(@Query() q: any) {
    return this.slipsService.getAuditLogs({
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 30,
      action: q.action,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canEdit' })
  update(
    @Param('id') id: string,
    @Body() body: { shopName?: string; amount?: string; details?: string; slipStatus?: string; isProxy?: string },
    @Request() req,
  ) {
    return this.slipsService.updateSlip(id, {
      shopName: body.shopName,
      amount: body.amount !== undefined ? parseAmount(body.amount) : undefined,
      details: body.details,
      slipStatus: body.slipStatus,
      isProxy: body.isProxy !== undefined ? body.isProxy === 'true' : undefined,
    }, req.user.id);
  }

  @Post('admin-create')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'approvals', action: 'canEdit' })
  @UseInterceptors(FileInterceptor('slip', { storage: memoryStorage() }))
  async adminCreate(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req,
  ) {
    let slipUrl = '';
    if (file?.buffer) {
      const dir = path.join(process.cwd(), 'uploads', 'line');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `slip-admin-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`;
      fs.writeFileSync(path.join(dir, filename), file.buffer);
      const appUrl = process.env.APP_URL || 'http://localhost:3002';
      slipUrl = `${appUrl}/uploads/line/${filename}`;
    }
    return this.slipsService.adminCreate({
      userId: body.userId,
      shopName: body.shopName,
      amount: parseAmount(body.amount),
      details: body.details || null,
      slipUrl,
      slipStatus: body.slipStatus || 'approved',
      isProxy: body.isProxy === 'true',
    }, req.user.id);
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
      amount: body.amount != null ? (parseAmount(body.amount) ?? undefined) : undefined,
      adminId: req.user.id,
    });
  }
}

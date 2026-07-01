import {
  Controller, Post, Patch, Get, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFiles, UploadedFile, Request, Logger,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { VisitsService } from './visits.service';
import { SlipService } from '../slip/slip.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const visitStorage = diskStorage({
  destination: './uploads/line',
  filename: (_req, file, cb) => {
    cb(null, `visit-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
  },
});

@Controller('visits')
export class VisitsController {
  private readonly logger = new Logger(VisitsController.name);

  constructor(
    private readonly visitsService: VisitsService,
    private readonly slipService: SlipService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 6, { storage: visitStorage }))
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Request() req,
  ) {
    return this.visitsService.create({
      userId: req.user.id,
      files,
      shopName: body.shopName,
      province: body.province,
      district: body.district || '',
      latitude: parseFloat(body.latitude),
      longitude: parseFloat(body.longitude),
      tripType: body.tripType || '',
      customerType: body.customerType,
      visitType: body.visitType || '',
      result: body.result || '',
      details: body.details || '',
      orderAmount: body.orderAmount ? parseFloat(body.orderAmount) : null,
      userEmail: req.user.email,
      slipUrl: body.slipUrl || null,
      slipStatus: body.slipStatus || null,
      transRef: body.transRef || null,
    });
  }

  @Post('verify-slip')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('slip', { storage: memoryStorage() }))
  async verifySlip(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      this.logger.warn('verify-slip called with no file');
      return { success: false, raw: { error: 'no file uploaded' } };
    }

    this.logger.log(`verify-slip: file=${file.originalname} size=${file.size} mime=${file.mimetype}`);

    const result = await this.slipService.verify(file.buffer, file.originalname);

    this.logger.log(`verify-slip result: success=${result.success} transRef=${result.transRef ?? '-'} amount=${result.amount ?? '-'}`);

    let slipUrl: string | null = null;
    if (file?.buffer) {
      const dir = path.join(process.cwd(), 'uploads', 'line');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `slip-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`;
      fs.writeFileSync(path.join(dir, filename), file.buffer);
      const appUrl = process.env.APP_URL || 'http://localhost:3002';
      slipUrl = `${appUrl}/uploads/line/${filename}`;
    }

    return { ...result, slipUrl };
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles({ menu: 'approvals', action: 'canEdit' })
  async approveVisit(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; amount?: number },
    @Request() req,
  ) {
    return this.visitsService.approveVisit({
      id,
      action: body.action,
      amount: body.amount,
      adminId: req.user.id,
      role: req.user.role,
    });
  }

  @Get('commission-summary')
  @UseGuards(JwtAuthGuard)
  getCommissionSummary(@Query('month') month: string) {
    const m = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return this.visitsService.getCommissionSummary(m);
  }

  @Get('my-commission')
  @UseGuards(JwtAuthGuard)
  getMyCommission(@Request() req, @Query('month') month: string) {
    const m = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return this.visitsService.getMyCommission(req.user.id, m);
  }

  @Get('commission-breakdown')
  @UseGuards(JwtAuthGuard)
  getCommissionBreakdown(@Query('userId') userId: string, @Query('month') month: string) {
    return this.visitsService.getCommissionBreakdown({ userId, month });
  }

  @Get('province-stats')
  @UseGuards(JwtAuthGuard)
  getProvinceStats(@Request() req, @Query() q: any) {
    return this.visitsService.getProvinceStats({
      userId: req.user.id,
      role: req.user.role,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Request() req, @Query() q: any) {
    return this.visitsService.findAll({
      userId: req.user.id,
      role: req.user.role,
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 100,
      province: q.province,
      result: q.result,
      tripType: q.tripType,
      visitType: q.visitType,
      customerType: q.customerType,
      search: q.search,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      slipStatus: q.slipStatus,
      filterUserId: q.filterUserId,
    });
  }
}

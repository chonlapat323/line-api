import {
  Controller, Post, Patch, Get, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFiles, UploadedFile, Request,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { VisitsService } from './visits.service';
import { SlipService } from '../slip/slip.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const visitStorage = diskStorage({
  destination: './uploads/line',
  filename: (_req, file, cb) => {
    cb(null, `visit-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
  },
});

@Controller('visits')
export class VisitsController {
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
    const result = await this.slipService.verify(file.buffer, file.originalname);

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
  @UseGuards(JwtAuthGuard)
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
      limit: q.limit ? parseInt(q.limit) : 20,
      province: q.province,
      result: q.result,
      tripType: q.tripType,
      visitType: q.visitType,
      customerType: q.customerType,
      search: q.search,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }
}

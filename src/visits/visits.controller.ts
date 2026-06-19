import {
  Controller, Post, Get, Body, Query, UseGuards, UseInterceptors,
  UploadedFiles, Request,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { VisitsService } from './visits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Store in uploads/line so LineService URL resolves correctly
const visitStorage = diskStorage({
  destination: './uploads/line',
  filename: (_req, file, cb) => {
    cb(null, `visit-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
  },
});

@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

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

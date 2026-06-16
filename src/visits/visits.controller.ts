import {
  Controller, Post, Get, Body, UseGuards, UseInterceptors,
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
      customerType: body.customerType,
      visitType: body.visitType || '',
      details: body.details || '',
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Request() req) {
    return this.visitsService.findByUser(req.user.id, req.user.role);
  }
}

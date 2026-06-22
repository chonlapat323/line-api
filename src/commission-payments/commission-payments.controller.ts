import {
  Controller, Post, Get, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { CommissionPaymentsService } from './commission-payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('commission-payments')
@UseGuards(JwtAuthGuard)
export class CommissionPaymentsController {
  constructor(private readonly service: CommissionPaymentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('slip', { storage: memoryStorage() }))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req,
  ) {
    let slipUrl: string | null = null;
    if (file?.buffer) {
      const dir = path.join(process.cwd(), 'uploads', 'commission');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `comm-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`;
      fs.writeFileSync(path.join(dir, filename), file.buffer);
      const appUrl = process.env.APP_URL || 'http://localhost:3002';
      slipUrl = `${appUrl}/uploads/commission/${filename}`;
    }

    return this.service.create({
      userId: body.userId,
      month: body.month,
      amount: parseFloat(body.amount),
      paidBy: req.user.id,
      note: body.note || undefined,
      slipUrl: slipUrl ?? undefined,
    });
  }

  @Get()
  findAll(@Query('month') month: string, @Query('userId') userId: string) {
    return this.service.findAll({ month: month || undefined, userId: userId || undefined });
  }
}

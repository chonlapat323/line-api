import {
  Controller, Post, Get, Body, Req, Res, Headers, UseGuards,
  UploadedFile, UseInterceptors, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { LineService } from './line.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response, Request as ExpressRequest } from 'express';

@Controller('line')
export class LineController {
  constructor(private readonly lineService: LineService) {}

  @Post('webhook')
  async webhook(
    @Req() req: ExpressRequest,
    @Res() res: Response,
    @Headers('x-line-signature') signature: string,
  ) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    // ตอบ 200 ทันที ไม่รอ process
    res.status(200).json({ ok: true });
    this.lineService.processWebhook(rawBody, signature, req.body.events || []).catch(console.error);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: './uploads/line',
      filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
      },
    }),
  }))
  async sendMessage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req,
  ) {
    return this.lineService.sendToGroups({
      senderId: req.user.id,
      file,
      targetUserIds: JSON.parse(body.targetUserIds || '[]'),
      title: body.title,
      price: body.price || '',
      note: body.note || '',
    });
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  getHistory(@Request() req) {
    return this.lineService.getHistory(req.user.id, req.user.role);
  }

  @Post('send-all')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: './uploads/line',
      filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
      },
    }),
  }))
  async sendToAll(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req,
  ) {
    return this.lineService.sendToAllGroups({
      senderId: req.user.id,
      file,
      title: body.title,
      price: body.price || '',
      note: body.note || '',
    });
  }
}

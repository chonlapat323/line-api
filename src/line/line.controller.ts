import {
  Controller, Post, Get, Body, Req, Res, Headers, UseGuards,
  UploadedFiles, UseInterceptors, Request,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { LineService } from './line.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response, Request as ExpressRequest } from 'express';

const imageStorage = diskStorage({
  destination: './uploads/line',
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
  },
});

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
    res.status(200).json({ ok: true });
    this.lineService.processWebhook(rawBody, signature, req.body.events || []).catch(console.error);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 6, { storage: imageStorage }))
  async sendMessage(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Request() req,
  ) {
    return this.lineService.sendToGroups({
      senderId: req.user.id,
      files,
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
  @UseInterceptors(FilesInterceptor('images', 6, { storage: imageStorage }))
  async sendToAll(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Request() req,
  ) {
    return this.lineService.sendToAllGroups({
      senderId: req.user.id,
      files,
      title: body.title,
      price: body.price || '',
      note: body.note || '',
    });
  }
}

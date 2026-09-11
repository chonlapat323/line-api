import {
  Controller, Post, Patch, Delete, Get, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFiles, UploadedFile, Request, Logger,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { VisitsService } from './visits.service';
import { SlipService } from '../slip/slip.service';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { parseAmount } from '../common/parse-amount.util';
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
    private readonly bankAccountsService: BankAccountsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 7, { storage: visitStorage }))
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
      shopNote: body.shopNote || '',
      shopPhone: body.shopPhone || '',
      latitude: parseFloat(body.latitude),
      longitude: parseFloat(body.longitude),
      tripType: body.tripType || '',
      customerType: body.customerType,
      visitType: body.visitType || '',
      result: body.result || '',
      details: body.details || '',
      orderAmount: parseAmount(body.orderAmount),
      userEmail: req.user.email,
      slipUrl: body.slipUrl || null,
      slipStatus: body.slipStatus || null,
      transRef: body.transRef || null,
    });
  }

  @Post('verify-slip')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('slip', { storage: memoryStorage() }))
  async verifySlip(@UploadedFile() file: Express.Multer.File, @Request() req) {
    this.logger.log(`[verify-slip] ── endpoint hit ──`);
    if (!file) {
      this.logger.warn('[verify-slip] no file in request');
      return { success: false, raw: { error: 'no file uploaded' } };
    }

    const userId: string = req.user.id;
    this.logger.log(`[verify-slip] received: file=${file.originalname} size=${file.size}B (${Math.round(file.size/1024)}KB) mime=${file.mimetype} userId=${userId}`);

    // 1. Check if user is currently blocked
    const block = await this.prisma.slipVerifyBlock.findUnique({ where: { userId } });
    if (block && block.blockedUntil > new Date()) {
      this.logger.warn(`[verify-slip] user ${userId} is blocked until ${block.blockedUntil.toISOString()}`);
      return { success: false, blocked: true, blockedUntil: block.blockedUntil.toISOString() };
    }

    // 2. Check if this slip image was already used (SHA256 of raw buffer)
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.prisma.slipHash.findUnique({ where: { hash } });
    if (existing) {
      this.logger.warn(`[verify-slip] duplicate slip hash=${hash.slice(0, 16)}… userId=${userId}`);
      await this.prisma.slipDuplicateLog.create({ data: { userId, hash } }).catch(() => {});
      return { success: false, duplicate: true };
    }

    // 3. Call Slip2Go
    const result = await this.slipService.verify(file.buffer, file.originalname);
    this.logger.log(`verify-slip result: success=${result.success} transRef=${result.transRef ?? '-'} amount=${result.amount ?? '-'}`);

    // 4. Save file to disk (always, for audit)
    let slipUrl: string | null = null;
    if (file?.buffer) {
      const dir = path.join(process.cwd(), 'uploads', 'line');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `slip-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`;
      fs.writeFileSync(path.join(dir, filename), file.buffer);
      const appUrl = process.env.APP_URL || 'http://localhost:3002';
      slipUrl = `${appUrl}/uploads/line/${filename}`;
    }

    // 5. Store hash now (before QR check) so ALL slip images are tracked regardless of QR result
    await this.prisma.slipHash.create({ data: { hash, userId } }).catch(() => {});

    // 6. QR-readable: check receiver + enforce rules
    if (result.success && result.receiverBankId && result.receiverAccountMasked) {

      // bankId "000" = PromptPay/proxy — Slip2Go cannot identify the bank, skip receiver check
      if (result.receiverBankId === '000') {
        this.logger.log(`[verify-slip] receiver bankId=000 (PromptPay) → skip account check`);
        return { ...result, slipUrl, receiverMatch: true };
      }

      // Check receiver against allowed accounts
      const receiverMatch = await this.bankAccountsService.checkReceiver(
        result.receiverBankId,
        result.receiverAccountMasked,
      );
      this.logger.log(`[verify-slip] receiver check: bankId=${result.receiverBankId} account=${result.receiverAccountMasked} match=${receiverMatch}`);

      if (!receiverMatch) {
        // Block user for 5 minutes
        const blockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        await this.prisma.slipVerifyBlock.upsert({
          where: { userId },
          create: { userId, blockedUntil },
          update: { blockedUntil },
        });
        this.logger.warn(`[verify-slip] receiver mismatch → blocking user ${userId} until ${blockedUntil.toISOString()}`);
        return { success: false, blocked: true, blockedUntil: blockedUntil.toISOString() };
      }

      return { ...result, slipUrl, receiverMatch: true };
    }

    // 7. QR not readable → pending_approval
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
      amount: body.amount != null ? (parseAmount(body.amount) ?? undefined) : undefined,
      adminId: req.user.id,
      role: req.user.role,
      roleName: req.user.roleName,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteVisit(@Param('id') id: string, @Request() req) {
    return this.visitsService.deleteVisit(id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  updateVisit(@Param('id') id: string, @Body() body: any, @Request() req) {
    return this.visitsService.updateVisit(id, req.user.id, req.user.role, {
      shopName: body.shopName,
      result: body.result,
      orderAmount: body.orderAmount !== undefined ? parseAmount(body.orderAmount) : undefined,
      details: body.details,
    });
  }

  @Get('commission-summary')
  @UseGuards(JwtAuthGuard)
  getCommissionSummary(@Query('month') month: string) {
    const m = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return this.visitsService.getCommissionSummary(m);
  }

  @Get('commission-overdue')
  @UseGuards(JwtAuthGuard)
  getCommissionOverdue() {
    return this.visitsService.getOverdueCommissions();
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

  @Get('last-by-shop')
  @UseGuards(JwtAuthGuard)
  getLastByShop(@Request() req, @Query('shopName') shopName: string) {
    return this.visitsService.lastByShop(req.user.id, shopName);
  }

  @Get('province-stats')
  @UseGuards(JwtAuthGuard)
  getProvinceStats(@Request() req, @Query() q: any) {
    return this.visitsService.getProvinceStats({
      userId: req.user.id,
      role: req.user.role,
      roleName: req.user.roleName,
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
      roleName: req.user.roleName,
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 100,
      province: q.province,
      district: q.district,
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

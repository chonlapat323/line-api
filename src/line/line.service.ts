import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as lineBot from '@line/bot-sdk';

@Injectable()
export class LineService {
  constructor(private prisma: PrismaService) {}

  private getClient() {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
    return new lineBot.messagingApi.MessagingApiClient({ channelAccessToken: token });
  }

  private validateSignature(body: string, signature: string) {
    const secret = process.env.LINE_CHANNEL_SECRET || '';
    return lineBot.validateSignature(body, secret, signature);
  }

  async processWebhook(rawBody: string, signature: string, events: any[]) {
    if (!this.validateSignature(rawBody, signature)) return;

    for (const event of events) {
      const source = event.source;
      if (source?.type !== 'group') continue;

      const groupId = source.groupId;
      const client = this.getClient();

      if (event.type === 'join') {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'สวัสดีครับ! กรุณาพิมพ์รหัสยืนยันจากระบบ BeautyUp เพื่อเชื่อมต่อกลุ่มนี้' }],
        });
      }

      if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text?.trim().toUpperCase();
        if (!text?.startsWith('BU-')) continue;

        const verif = await this.prisma.lineVerificationCode.findUnique({
          where: { code: text },
          include: { user: true },
        });

        if (!verif || verif.usedAt || verif.expiresAt < new Date()) {
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 'รหัสไม่ถูกต้องหรือหมดอายุแล้วครับ กรุณาขอรหัสใหม่จากระบบ' }],
          });
          continue;
        }

        await this.prisma.$transaction([
          this.prisma.userLineGroup.upsert({
            where: { userId_lineGroupId: { userId: verif.userId, lineGroupId: groupId } },
            update: { isActive: true, verifiedAt: new Date() },
            create: { userId: verif.userId, lineGroupId: groupId, verifiedAt: new Date() },
          }),
          this.prisma.lineVerificationCode.update({
            where: { id: verif.id },
            data: { usedAt: new Date() },
          }),
        ]);

        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'เชื่อมต่อสำเร็จแล้วครับ ✓\nกลุ่มนี้จะได้รับการแจ้งเตือนจากระบบ BeautyUp' }],
        });
      }

      if (event.type === 'leave') {
        await this.prisma.userLineGroup.updateMany({
          where: { lineGroupId: groupId },
          data: { isActive: false },
        });
      }
    }
  }

  private buildFlexMessage(data: {
    imageUrl: string;
    title: string;
    price?: string;
    note?: string;
    senderName: string;
  }): lineBot.messagingApi.FlexMessage {
    return {
      type: 'flex',
      altText: `${data.senderName} ส่งรูปสินค้า: ${data.title}`,
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: data.imageUrl,
          size: 'full',
          aspectRatio: '4:3',
          aspectMode: 'cover',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'text', text: data.title, weight: 'bold', size: 'lg', wrap: true },
            ...(data.price ? [{ type: 'text' as const, text: `ราคา: ${data.price}`, size: 'md' as const, color: '#e63c3c' }] : []),
            ...(data.note ? [{ type: 'text' as const, text: data.note, size: 'sm' as const, color: '#666666', wrap: true }] : []),
            { type: 'text', text: `โดย: ${data.senderName}`, size: 'xs', color: '#aaaaaa' },
          ],
        },
      },
    };
  }

  async sendToGroups(params: {
    senderId: string;
    file: Express.Multer.File;
    targetUserIds: string[];
    title: string;
    price: string;
    note: string;
  }) {
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const imageUrl = `${appUrl}/uploads/line/${params.file.filename}`;
    console.log('[SEND] imageUrl:', imageUrl);
    console.log('[SEND] senderId:', params.senderId);
    console.log('[SEND] targetUserIds:', params.targetUserIds);

    const sender = await this.prisma.user.findUnique({ where: { id: params.senderId } });
    if (!sender) return { error: 'ไม่พบผู้ใช้' };

    const client = this.getClient();
    const results = [];

    for (const targetUserId of params.targetUserIds) {
      const groups = await this.prisma.userLineGroup.findMany({
        where: { userId: targetUserId, isActive: true },
      });

      console.log(`[SEND] userId=${targetUserId} groups found:`, groups.length);

      if (!groups.length) {
        results.push({ userId: targetUserId, status: 'failed', error: 'ไม่พบ LINE group' });
        continue;
      }

      const flexMsg = this.buildFlexMessage({
        imageUrl,
        title: params.title,
        price: params.price,
        note: params.note,
        senderName: sender.fullName,
      });

      for (const group of groups) {
        try {
          await client.pushMessage({ to: group.lineGroupId, messages: [flexMsg] });
          await this.prisma.lineSendLog.create({
            data: {
              senderId: params.senderId,
              targetUserId,
              lineGroupId: group.lineGroupId,
              imageUrl,
              details: { title: params.title, price: params.price, note: params.note },
              status: 'success',
            },
          });
          results.push({ userId: targetUserId, status: 'success' });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('[SEND] LINE error:', errorMessage, err);
          await this.prisma.lineSendLog.create({
            data: {
              senderId: params.senderId,
              targetUserId,
              lineGroupId: group.lineGroupId,
              imageUrl,
              details: { title: params.title, price: params.price, note: params.note },
              status: 'failed',
              errorMessage,
            },
          });
          results.push({ userId: targetUserId, status: 'failed', error: errorMessage });
        }
      }
    }

    return { results };
  }

  async getHistory(userId: string, role: string) {
    const where = role === 'admin' ? {} : { senderId: userId };
    return this.prisma.lineSendLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        targetUser: { select: { fullName: true, email: true } },
      },
    });
  }

  async sendToAllGroups(params: {
    senderId: string;
    file: Express.Multer.File;
    title: string;
    price: string;
    note: string;
  }) {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    return this.sendToGroups({ ...params, targetUserIds: users.map((u) => u.id) });
  }
}

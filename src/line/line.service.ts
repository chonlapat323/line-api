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

  // Build image grid rows for Flex Message (2 images per row)
  private buildImageGrid(imageUrls: string[]): any[] {
    const rows: any[] = [];
    for (let i = 0; i < imageUrls.length; i += 2) {
      const pair = imageUrls.slice(i, i + 2);
      rows.push({
        type: 'box',
        layout: 'horizontal',
        spacing: 'xs',
        contents: pair.map((url) => ({
          type: 'image',
          url,
          flex: 1,
          aspectMode: 'cover',
          aspectRatio: '1:1',
          animated: false,
        })),
      });
    }
    return rows;
  }

  private buildFlexMessage(data: {
    imageUrls: string[];
    title: string;
    price?: string;
    note?: string;
    senderName: string;
  }): lineBot.messagingApi.FlexMessage {
    const { imageUrls, title, price, note, senderName } = data;
    const isSingle = imageUrls.length === 1;

    const infoContents: any[] = [
      { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
      ...(price ? [{ type: 'text', text: `ราคา: ${price}`, size: 'md', color: '#e63c3c' }] : []),
      ...(note ? [{ type: 'text', text: note, size: 'sm', color: '#666666', wrap: true }] : []),
      { type: 'text', text: `โดย: ${senderName}`, size: 'xs', color: '#aaaaaa' },
    ];

    // Single image → hero (large) + info below
    if (isSingle) {
      return {
        type: 'flex',
        altText: `${senderName} ส่งรูปสินค้า: ${title}`,
        contents: {
          type: 'bubble',
          hero: {
            type: 'image',
            url: imageUrls[0],
            size: 'full',
            aspectRatio: '4:3',
            aspectMode: 'cover',
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: infoContents,
          },
        },
      };
    }

    // Multiple images → grid + info below
    return {
      type: 'flex',
      altText: `${senderName} ส่งรูปสินค้า ${imageUrls.length} รูป: ${title}`,
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: 'none',
          contents: [
            // Image grid (no padding)
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              paddingAll: 'xs',
              contents: this.buildImageGrid(imageUrls),
            },
            // Info section (with padding)
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              paddingAll: 'md',
              contents: infoContents,
            },
          ],
        },
      },
    };
  }

  async sendToGroups(params: {
    senderId: string;
    files: Express.Multer.File[];
    targetUserIds: string[];
    title: string;
    price: string;
    note: string;
  }) {
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const imageUrls = params.files.map((f) => `${appUrl}/uploads/line/${f.filename}`);
    const primaryImageUrl = imageUrls[0];

    const sender = await this.prisma.user.findUnique({ where: { id: params.senderId } });
    if (!sender) return { error: 'ไม่พบผู้ใช้' };

    const client = this.getClient();
    const results = [];

    const flexMsg = this.buildFlexMessage({
      imageUrls,
      title: params.title,
      price: params.price,
      note: params.note,
      senderName: sender.fullName,
    });

    for (const targetUserId of params.targetUserIds) {
      const groups = await this.prisma.userLineGroup.findMany({
        where: { userId: targetUserId, isActive: true },
      });

      if (!groups.length) {
        results.push({ userId: targetUserId, status: 'failed', error: 'ไม่พบ LINE group' });
        continue;
      }

      for (const group of groups) {
        try {
          await client.pushMessage({ to: group.lineGroupId, messages: [flexMsg] });
          await this.prisma.lineSendLog.create({
            data: {
              senderId: params.senderId,
              targetUserId,
              lineGroupId: group.lineGroupId,
              imageUrl: primaryImageUrl,
              details: {
                title: params.title,
                price: params.price,
                note: params.note,
                imageUrls,
                imageCount: imageUrls.length,
              },
              status: 'success',
            },
          });
          results.push({ userId: targetUserId, status: 'success' });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('[SEND] LINE error:', errorMessage);
          await this.prisma.lineSendLog.create({
            data: {
              senderId: params.senderId,
              targetUserId,
              lineGroupId: group.lineGroupId,
              imageUrl: primaryImageUrl,
              details: {
                title: params.title,
                price: params.price,
                note: params.note,
                imageUrls,
                imageCount: imageUrls.length,
              },
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
      take: 100,
      include: {
        targetUser: { select: { fullName: true, email: true } },
      },
    });
  }

  async sendToAllGroups(params: {
    senderId: string;
    files: Express.Multer.File[];
    title: string;
    price: string;
    note: string;
  }) {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    return this.sendToGroups({ ...params, targetUserIds: users.map((u) => u.id) });
  }
}

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
          action: { type: 'uri', uri: url },
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
    type?: 'trip' | 'slip';
    isEdit?: boolean;
    slipStatus?: string;
    isProxy?: boolean;
    commissionRate?: number;
  }): lineBot.messagingApi.FlexMessage {
    const { imageUrls, title, price, note, senderName, type, isEdit, slipStatus, isProxy, commissionRate } = data;
    const isSingle = imageUrls.length === 1;

    const priceLabel = type === 'trip' ? 'เปิดบิล' : 'ยอด';
    const priceColor = type === 'trip' ? '#2ba05a' : '#e83e8c';
    const typeLabel = isEdit ? 'แก้ไขทริป' : type === 'trip' ? 'รายงานทริป' : type === 'slip' ? 'ส่งสลิป' : null;
    const typeLabelColor = isEdit ? '#dc2626' : '#e83e8c';
    const altPrefix = isEdit ? 'แก้ไขทริป' : type === 'trip' ? 'รายงานทริป' : type === 'slip' ? 'ส่งสลิป' : 'ส่งรูปสินค้า';

    const slipStatusText = type === 'slip' && slipStatus
      ? (slipStatus === 'verified' ? 'QR ผ่านแล้ว' : 'รออนุมัติ')
      : '';
    const commText = type === 'slip' && commissionRate !== undefined
      ? (isProxy ? `เก็บแทน • ค่าคอม ${commissionRate}%` : `ปกติ • ค่าคอม ${commissionRate}%`)
      : '';

    const copyText = [
      isEdit ? '[แก้ไข]' : '',
      title,
      slipStatusText,
      commText,
      price ? `${priceLabel}: ${price}` : '',
      note,
      `โดย: ${senderName}`,
    ].filter(Boolean).join('\n');

    const infoContents: any[] = [
      ...(typeLabel ? [{ type: 'text', text: typeLabel, size: 'xs', color: typeLabelColor, weight: 'bold' }] : []),
      { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
      // Slip status badge
      ...(type === 'slip' && slipStatus ? [{
        type: 'text',
        text: slipStatus === 'verified' ? '✅  QR ผ่านแล้ว' : '⏳  รออนุมัติ',
        size: 'sm',
        color: slipStatus === 'verified' ? '#16a34a' : '#d97706',
        weight: 'bold',
      }] : []),
      // Commission type line
      ...(type === 'slip' && commissionRate !== undefined ? [{
        type: 'text',
        text: isProxy ? `เก็บแทน • ค่าคอม ${commissionRate}%` : `ปกติ • ค่าคอม ${commissionRate}%`,
        size: 'xs',
        color: isProxy ? '#2563eb' : '#16a34a',
      }] : []),
      ...(price ? [{ type: 'text', text: `${priceLabel}: ${price}`, size: 'md', color: priceColor }] : []),
      ...(note ? [{ type: 'text', text: note, size: 'sm', color: '#666666', wrap: true }] : []),
      { type: 'text', text: `โดย: ${senderName}`, size: 'xs', color: '#aaaaaa' },
      {
        type: 'button',
        action: { type: 'clipboard', label: 'คัดลอกข้อความ', clipboardText: copyText },
        style: 'link',
        height: 'sm',
        color: '#aaaaaa',
      },
    ];

    // Single image → hero (large) + info below
    if (isSingle) {
      return {
        type: 'flex',
        altText: `${senderName} ${altPrefix}: ${title}`,
        contents: {
          type: 'bubble',
          hero: {
            type: 'image',
            url: imageUrls[0],
            size: 'full',
            aspectRatio: '4:3',
            aspectMode: 'cover',
            action: { type: 'uri', uri: imageUrls[0] },
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
      altText: `${senderName} ${altPrefix} ${imageUrls.length} รูป: ${title}`,
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

  private async pushToGroups(params: {
    senderId: string;
    imageUrls: string[];
    targetUserIds: string[];
    title: string;
    price: string;
    note: string;
    senderName: string;
    type?: 'trip' | 'slip';
    isEdit?: boolean;
    slipStatus?: string;
    isProxy?: boolean;
    commissionRate?: number;
  }) {
    const { imageUrls, senderName } = params;
    const primaryImageUrl = imageUrls[0];
    const client = this.getClient();
    const results = [];

    const flexMsg = this.buildFlexMessage({
      imageUrls,
      title: params.title,
      price: params.price,
      note: params.note,
      senderName,
      type: params.type,
      isEdit: params.isEdit,
      slipStatus: params.slipStatus,
      isProxy: params.isProxy,
      commissionRate: params.commissionRate,
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
              details: { title: params.title, price: params.price, note: params.note, imageUrls, imageCount: imageUrls.length },
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
              details: { title: params.title, price: params.price, note: params.note, imageUrls, imageCount: imageUrls.length },
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

  async sendToGroups(params: {
    senderId: string;
    files: Express.Multer.File[];
    targetUserIds: string[];
    title: string;
    price: string;
    note: string;
    type?: 'trip' | 'slip';
  }) {
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const imageUrls = params.files.map((f) => `${appUrl}/uploads/line/${f.filename}`);
    const sender = await this.prisma.user.findUnique({ where: { id: params.senderId } });
    if (!sender) return { error: 'ไม่พบผู้ใช้' };
    return this.pushToGroups({ ...params, imageUrls, senderName: sender.fullName });
  }

  async sendToGroupsWithUrls(params: {
    senderId: string;
    imageUrls: string[];
    targetUserIds: string[];
    title: string;
    price: string;
    note: string;
    type?: 'trip' | 'slip';
    isEdit?: boolean;
    slipStatus?: string;
    isProxy?: boolean;
    commissionRate?: number;
  }) {
    const sender = await this.prisma.user.findUnique({ where: { id: params.senderId } });
    if (!sender) return { error: 'ไม่พบผู้ใช้' };
    return this.pushToGroups({ ...params, senderName: sender.fullName });
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

  // ── Announcements: broadcast to everyone who added the LINE OA as a friend ──

  private decodeEntities(s: string): string {
    return s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  // Parses simple inline formatting (bold/italic/underline) from editor HTML into Flex text spans.
  // Nested marks (e.g. bold+italic together) degrade to the outer mark only — acceptable for announcement copy.
  private parseInlineSpans(html: string): any[] {
    const spans: any[] = [];
    const re = /<(strong|b|em|i|u)>([\s\S]*?)<\/\1>|([^<]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (m[3] !== undefined) {
        const text = this.decodeEntities(m[3]);
        if (text) spans.push({ type: 'span', text });
      } else {
        const tag = m[1].toLowerCase();
        const inner = this.decodeEntities(m[2].replace(/<[^>]+>/g, ''));
        if (!inner) continue;
        const span: any = { type: 'span', text: inner };
        if (tag === 'strong' || tag === 'b') span.weight = 'bold';
        if (tag === 'em' || tag === 'i') span.style = 'italic';
        if (tag === 'u') span.decoration = 'underline';
        spans.push(span);
      }
    }
    if (!spans.length) {
      const plain = this.decodeEntities(html.replace(/<[^>]+>/g, ''));
      if (plain) spans.push({ type: 'span', text: plain });
    }
    return spans;
  }

  // Converts editor HTML (paragraphs, bullet/numbered lists, bold/italic/underline) into Flex body contents.
  private htmlToFlexContents(html: string): any[] {
    const contents: any[] = [];
    const blockRe = /<p>([\s\S]*?)<\/p>|<ul>([\s\S]*?)<\/ul>|<ol>([\s\S]*?)<\/ol>/g;
    let m: RegExpExecArray | null;
    let matched = false;
    while ((m = blockRe.exec(html))) {
      matched = true;
      if (m[1] !== undefined) {
        const inner = m[1].trim();
        contents.push(
          inner
            ? { type: 'text', wrap: true, size: 'sm', contents: this.parseInlineSpans(inner) }
            : { type: 'text', text: ' ', size: 'xs' },
        );
      } else if (m[2] !== undefined) {
        const liRe = /<li>([\s\S]*?)<\/li>/g;
        let lm: RegExpExecArray | null;
        while ((lm = liRe.exec(m[2]))) {
          contents.push({
            type: 'text', wrap: true, size: 'sm',
            contents: [{ type: 'span', text: '•  ' }, ...this.parseInlineSpans(lm[1].trim())],
          });
        }
      } else if (m[3] !== undefined) {
        const liRe = /<li>([\s\S]*?)<\/li>/g;
        let lm: RegExpExecArray | null;
        let idx = 1;
        while ((lm = liRe.exec(m[3]))) {
          contents.push({
            type: 'text', wrap: true, size: 'sm',
            contents: [{ type: 'span', text: `${idx}.  ` }, ...this.parseInlineSpans(lm[1].trim())],
          });
          idx++;
        }
      }
    }
    if (!matched) {
      const plain = html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').trim();
      for (const line of plain.split('\n')) {
        contents.push({ type: 'text', text: line || ' ', wrap: true, size: 'sm' });
      }
    }
    return contents;
  }

  private buildAnnouncementFlex(params: {
    title: string; bodyHtml: string; imageUrl?: string; buttonText?: string; buttonUrl?: string;
  }): lineBot.messagingApi.FlexMessage {
    const bodyContents = this.htmlToFlexContents(params.bodyHtml);

    const contents: any = {
      type: 'bubble',
      ...(params.imageUrl ? {
        hero: { type: 'image', url: params.imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' },
      } : {}),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '📢 ประกาศ', size: 'xs', color: '#16a34a', weight: 'bold' },
          { type: 'text', text: params.title, weight: 'bold', size: 'lg', wrap: true },
          { type: 'separator', margin: 'md' },
          ...bodyContents,
        ],
      },
      ...(params.buttonText && params.buttonUrl ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#16a34a',
            action: { type: 'uri', label: params.buttonText.slice(0, 40), uri: params.buttonUrl },
          }],
        },
      } : {}),
    };

    return { type: 'flex', altText: `📢 ${params.title}`.slice(0, 400), contents };
  }

  async broadcastAnnouncement(params: {
    senderId: string;
    title: string;
    bodyHtml: string;
    imageUrl?: string;
    buttonText?: string;
    buttonUrl?: string;
  }) {
    const client = this.getClient();
    const flexMsg = this.buildAnnouncementFlex(params);
    const baseData = {
      title: params.title,
      bodyHtml: params.bodyHtml,
      imageUrl: params.imageUrl || null,
      buttonText: params.buttonText || null,
      buttonUrl: params.buttonUrl || null,
      sentById: params.senderId,
    };

    try {
      await client.broadcast({ messages: [flexMsg] });
      return this.prisma.announcement.create({ data: { ...baseData, status: 'sent' } });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.announcement.create({ data: { ...baseData, status: 'failed', errorMessage } });
      throw new Error(errorMessage);
    }
  }

  async getAnnouncements() {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { sentBy: { select: { fullName: true } } },
    });
  }
}

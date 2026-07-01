import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private sheetTitle: string | null = null;
  private sheetTitleCache = new Map<string, string>();

  private getAuth() {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    return new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
  }

  private async getFirstSheetTitle(): Promise<string> {
    if (this.sheetTitle) return this.sheetTitle;
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const auth = this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId! });
    this.sheetTitle = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';
    return this.sheetTitle;
  }

  async uploadFileToDrive(filePath: string, filename: string, mimeType: string): Promise<string> {
    const auth = this.getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const file = await drive.files.create({
      requestBody: { name: filename, ...(folderId ? { parents: [folderId] } : {}) },
      media: { mimeType, body: fs.createReadStream(filePath) },
      fields: 'id',
    });

    const fileId = file.data.id!;
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  async appendVisitRow(row: string[]): Promise<void> {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return;

    const auth = this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const title = await this.getFirstSheetTitle();

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${title}'!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  }

  private async getSheetTitleById(sheetId: string): Promise<string> {
    if (this.sheetTitleCache.has(sheetId)) return this.sheetTitleCache.get(sheetId)!;
    const auth = this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const title = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';
    this.sheetTitleCache.set(sheetId, title);
    return title;
  }

  async appendToSheetById(sheetId: string, row: string[], header: string[]): Promise<void> {
    if (!sheetId) return;
    const auth = this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    this.logger.log(`Sheets step 1: getSheetTitle id=${sheetId}`);
    const title = await this.getSheetTitleById(sheetId);
    this.logger.log(`Sheets step 2: got title="${title}", checking A1`);

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${title}'!A1`,
    });
    this.logger.log(`Sheets step 3: A1 hasHeader=${!!existing.data.values?.length}, appending row`);

    if (!existing.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${title}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [header] },
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${title}'!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    this.logger.log(`Sheets step 4: append success`);
  }

  async ensureSheetHeader(): Promise<void> {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return;

    const auth = this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const title = await this.getFirstSheetTitle();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${title}'!A1`,
    });

    if (!res.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${title}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            'ประทับเวลา', 'ที่อยู่อีเมล', 'ทริป', 'ภารกิจ', 'ลูกค้า',
            'ชื่อร้าน', 'Link Google Maps', 'จังหวัด', '(*สำหรับกทม.)',
            'ผลตอบรับ', 'Line OA (1 รูป)', 'รูปหน้าร้าน (1รูป)', 'รูปในร้าน (1รูป)',
            'สรุปผล', 'ใบ X-Ray ส่ง (1รูป)',
          ]],
        },
      });
    }
  }
}

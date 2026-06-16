import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private sheetTitle: string | null = null;

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
            'วันที่', 'เซล', 'ชื่อร้าน', 'จังหวัด', 'เขต',
            'ทริป', 'ลูกค้า', 'ภารกิจ', 'ผลตอบรับ', 'สรุปผล',
            'หน้าร้าน 1', 'หน้าร้าน 2', 'ภายในร้าน 1', 'ภายในร้าน 2', 'หน้าจอ Line', 'X-ray', 'lat', 'lng',
          ]],
        },
      });
    }
  }
}

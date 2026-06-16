import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

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

  async uploadFileToDrive(filePath: string, filename: string, mimeType: string): Promise<string> {
    const auth = this.getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const file = await drive.files.create({
      requestBody: { name: filename },
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

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:Z',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  }

  async ensureSheetHeader(): Promise<void> {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return;

    const auth = this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1',
    });

    if (!res.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1',
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

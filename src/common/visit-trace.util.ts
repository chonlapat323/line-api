import * as fs from 'fs';
import * as path from 'path';

// Dedicated, verbose, per-day trace log for the trip-recording (createVisit) flow —
// separate from the normal Nest logger — so we can see exactly what happened
// (timing of every step, real errors) the next time a sales rep hits
// "ไม่สามารถเชื่อมต่อ server ได้", instead of guessing.
const LOG_DIR = path.join(process.cwd(), 'logs', 'visit');

function todayFileName(): string {
  // Bangkok-local date, since that's the timezone the team and the daily logs use.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  return path.join(LOG_DIR, `${day}.log`);
}

export function genRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function visitTrace(event: string, data: Record<string, unknown> = {}): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...data,
    });
    fs.appendFileSync(todayFileName(), line + '\n');
  } catch {
    // Logging must never be the reason a request fails.
  }
}

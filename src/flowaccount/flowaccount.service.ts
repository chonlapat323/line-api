import { Injectable, Logger } from '@nestjs/common';

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

export type FlowAccountContact = {
  contactId: number;
  contactName: string;
};

@Injectable()
export class FlowAccountService {
  private readonly logger = new Logger(FlowAccountService.name);
  private readonly tokenUrl =
    process.env.FLOWACCOUNT_TOKEN_URL ?? 'https://openapi.flowaccount.com/test/token';
  private readonly baseUrl =
    process.env.FLOWACCOUNT_BASE_URL ?? 'https://openapi.flowaccount.com/test';
  private readonly clientId = process.env.FLOWACCOUNT_CLIENT_ID ?? '';
  private readonly clientSecret = process.env.FLOWACCOUNT_CLIENT_SECRET ?? '';
  private tokenCache: TokenCache | null = null;

  private async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.accessToken;
    }

    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'flowaccount-api',
      }),
    });

    const rawBody = await res.text();
    if (!res.ok) {
      throw new Error(`FlowAccount token error: ${res.status} ${rawBody}`);
    }

    const data = JSON.parse(rawBody) as { access_token: string; expires_in: number };
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };
    return this.tokenCache.accessToken;
  }

  // Fetches one page of contacts. FlowAccount caps pageSize at 200.
  async listContactsPage(currentPage: number, pageSize = 200): Promise<{ contacts: FlowAccountContact[]; hasMore: boolean; total: number | null }> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/contacts?currentPage=${currentPage}&pageSize=${pageSize}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rawBody = await res.text();
    if (!res.ok) {
      throw new Error(`FlowAccount list contacts error: ${res.status} ${rawBody}`);
    }

    const data = JSON.parse(rawBody);
    const items: unknown =
      Array.isArray(data) ? data
      : Array.isArray(data.data?.list) ? data.data.list
      : Array.isArray(data.data) ? data.data
      : Array.isArray(data.data?.data) ? data.data.data
      : Array.isArray(data.contacts) ? data.contacts
      : Array.isArray(data.items) ? data.items
      : Array.isArray(data.result) ? data.result
      : null;

    if (!Array.isArray(items)) {
      this.logger.error(`[listContactsPage] Unexpected response shape. Keys: ${Object.keys(data).join(', ')}. Body: ${rawBody.slice(0, 1000)}`);
      throw new Error('FlowAccount list contacts: unrecognized response shape (see logs for raw body)');
    }

    const contacts: FlowAccountContact[] = (items as any[])
      .map((c) => ({ contactId: c.contactId ?? c.id, contactName: c.contactName }))
      .filter((c) => c.contactId != null && c.contactName);

    const total: number | null = typeof data.data?.total === 'number' ? data.data.total : null;
    const hasMore = total != null
      ? currentPage * pageSize < total
      : items.length === pageSize;

    return { contacts, hasMore, total };
  }

  // Pages through the entire contact list. Safety cap avoids an infinite loop if FlowAccount's
  // pagination signal ever behaves unexpectedly.
  async listAllContacts(maxPages = 200): Promise<FlowAccountContact[]> {
    const all: FlowAccountContact[] = [];
    let page = 1;
    while (page <= maxPages) {
      const { contacts, hasMore } = await this.listContactsPage(page);
      all.push(...contacts);
      if (!hasMore) break;
      page++;
    }
    return all;
  }
}

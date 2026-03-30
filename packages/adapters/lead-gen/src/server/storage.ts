// ---------------------------------------------------------------------------
// Duplicate-detection storage layer.
// Default: in-memory store for single-run dedup.
// Production: swap `createStore` to a real DB adapter (Postgres, SQLite, etc.)
// ---------------------------------------------------------------------------

import type { MlsListing } from "./mls.js";

export interface LeadRecord {
  mlsId: string;
  address: string;
  agentEmail: string;
  outreachSentAt: string | null;
  createdAt: string;
}

export interface ListingStore {
  hasListing(mlsId: string): Promise<boolean>;
  saveListing(listing: MlsListing): Promise<void>;
  markOutreachSent(mlsId: string): Promise<void>;
  getListing(mlsId: string): Promise<LeadRecord | null>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (zero dependencies — swap for DB in production)
// ---------------------------------------------------------------------------

class InMemoryStore implements ListingStore {
  private readonly records = new Map<string, LeadRecord>();

  async hasListing(mlsId: string): Promise<boolean> {
    return this.records.has(mlsId);
  }

  async saveListing(listing: MlsListing): Promise<void> {
    if (this.records.has(listing.mlsId)) return;
    this.records.set(listing.mlsId, {
      mlsId: listing.mlsId,
      address: `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`,
      agentEmail: listing.listingAgent.email,
      outreachSentAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  async markOutreachSent(mlsId: string): Promise<void> {
    const record = this.records.get(mlsId);
    if (record) {
      record.outreachSentAt = new Date().toISOString();
    }
  }

  async getListing(mlsId: string): Promise<LeadRecord | null> {
    return this.records.get(mlsId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Google Sheets implementation stub
// Swap InMemoryStore for this when GOOGLE_SHEETS_ID is configured.
// ---------------------------------------------------------------------------

class GoogleSheetsStore implements ListingStore {
  constructor(
    private readonly sheetsId: string,
    private readonly accessToken: string,
  ) {}

  private get baseUrl() {
    return `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetsId}/values`;
  }

  private async fetchRows(): Promise<string[][]> {
    const res = await fetch(`${this.baseUrl}/Listings!A:E`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error(`Sheets read error ${res.status}`);
    const data = (await res.json()) as { values?: string[][] };
    return data.values ?? [];
  }

  async hasListing(mlsId: string): Promise<boolean> {
    const rows = await this.fetchRows();
    return rows.slice(1).some((row) => row[0] === mlsId);
  }

  async saveListing(listing: MlsListing): Promise<void> {
    const address = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
    await fetch(`${this.baseUrl}/Listings!A:E:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[listing.mlsId, address, listing.listingAgent.email, "", new Date().toISOString()]],
      }),
    });
  }

  async markOutreachSent(mlsId: string): Promise<void> {
    // Placeholder: find row by mlsId, update column D with timestamp.
    // Full implementation requires a row-index lookup then a PATCH request.
    void mlsId;
  }

  async getListing(mlsId: string): Promise<LeadRecord | null> {
    const rows = await this.fetchRows();
    const row = rows.slice(1).find((r) => r[0] === mlsId);
    if (!row) return null;
    return {
      mlsId: row[0] ?? "",
      address: row[1] ?? "",
      agentEmail: row[2] ?? "",
      outreachSentAt: row[3] || null,
      createdAt: row[4] ?? "",
    };
  }
}

// ---------------------------------------------------------------------------
// Factory — extend with more backends as needed
// ---------------------------------------------------------------------------

export function createStore(opts: {
  dbUrl?: string;
  googleSheetsId?: string;
  googleAccessToken?: string;
}): ListingStore {
  if (opts.googleSheetsId && opts.googleAccessToken) {
    return new GoogleSheetsStore(opts.googleSheetsId, opts.googleAccessToken);
  }
  // Postgres / SQLite via dbUrl: add a Drizzle/Kysely adapter here.
  return new InMemoryStore();
}

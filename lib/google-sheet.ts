// lib/google-sheet.ts — fetch + parse the Google Ads sheet (server-side).
//
// Reads the "Summary" and "Campaigns" tabs via Google's public gviz CSV export
// and maps them to the GoogleAdsData shape. The sheet is link-viewable, so no
// credentials are involved.

import {
  GoogleAdsData,
  GoogleAdsSummary,
  GoogleAdsCampaign,
} from '@/types/google-ads';
import {
  GOOGLE_SHEET_SUMMARY_TAB,
  GOOGLE_SHEET_CAMPAIGNS_TAB,
  GOOGLE_ADS_CURRENCY,
  sheetCsvUrl,
} from '@/lib/google-ads-config';

/** Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes, commas
 *  and newlines inside quotes. Returns an array of rows (arrays of strings). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // ignore — handled by the \n branch
    } else {
      field += char;
    }
  }

  // flush the trailing field/row (file may not end with a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Parses CSV text into an array of objects keyed by the header row. */
function parseCsvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ''));
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = (cells[idx] ?? '').trim();
    });
    return obj;
  });
}

/** Parses a numeric cell, tolerating commas/blank values. */
function num(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchTab(tabName: string): Promise<Record<string, string>[]> {
  const url = sheetCsvUrl(tabName);
  const res = await fetch(url, {
    // Always pull fresh from the sheet; our own TTL cache sits in the route.
    cache: 'no-store',
    headers: { Accept: 'text/csv' },
  });

  if (!res.ok) {
    throw new Error(
      `Could not read the "${tabName}" sheet (HTTP ${res.status}). ` +
        `Make sure the spreadsheet is shared as "Anyone with the link can view" ` +
        `and the tab is named exactly "${tabName}".`
    );
  }

  return parseCsvToObjects(await res.text());
}

function toSummary(rows: Record<string, string>[]): GoogleAdsSummary | null {
  const r = rows[0];
  if (!r) return null;
  return {
    customerId: r.customerId || '',
    accountName: r.accountName || '',
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    cost: num(r.cost),
    conversions: num(r.conversions),
    ctr: num(r.ctr),
    avgCpc: num(r.avgCpc),
    updatedAt: r.updatedAt || '',
  };
}

function toCampaigns(rows: Record<string, string>[]): GoogleAdsCampaign[] {
  return rows
    .filter((r) => r.campaignId || r.campaignName)
    .map((r) => ({
      campaignId: r.campaignId || '',
      campaignName: r.campaignName || '',
      status: r.status || '',
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      cost: num(r.cost),
      conversions: num(r.conversions),
      ctr: num(r.ctr),
      avgCpc: num(r.avgCpc),
      updatedAt: r.updatedAt || '',
    }));
}

/** Reads both tabs and returns the combined Google Ads dashboard payload. */
export async function getGoogleAdsData(): Promise<GoogleAdsData> {
  const [summaryRows, campaignRows] = await Promise.all([
    fetchTab(GOOGLE_SHEET_SUMMARY_TAB),
    fetchTab(GOOGLE_SHEET_CAMPAIGNS_TAB),
  ]);

  return {
    summary: toSummary(summaryRows),
    campaigns: toCampaigns(campaignRows),
    currency: GOOGLE_ADS_CURRENCY,
    lastUpdated: new Date().toISOString(),
  };
}

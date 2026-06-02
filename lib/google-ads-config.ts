// lib/google-ads-config.ts — where the Google Ads tab reads its data from.
//
// Data lives in a Google Sheet (populated by an Apps Script). The sheet is
// shared "anyone with the link can view", so we read it via Google's public
// gviz CSV export — no API key or OAuth needed.

/** Spreadsheet id (from the sheet URL: /spreadsheets/d/<ID>/edit). */
export const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID || '1svJJxKz1W27TAVULbuULWn0YEtRZsXq-qg_nAFaMIQU';

/** Tab names within the spreadsheet. */
export const GOOGLE_SHEET_SUMMARY_TAB = process.env.GOOGLE_SHEET_SUMMARY_TAB || 'Summary';
export const GOOGLE_SHEET_CAMPAIGNS_TAB = process.env.GOOGLE_SHEET_CAMPAIGNS_TAB || 'Campaigns';

/** Currency the sheet's cost/avgCpc values are in (display only). */
export const GOOGLE_ADS_CURRENCY = process.env.GOOGLE_ADS_CURRENCY || 'INR';

/** Builds the public CSV export URL for a given tab. */
export function sheetCsvUrl(tabName: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq`;
  const params = new URLSearchParams({ tqx: 'out:csv', sheet: tabName });
  return `${base}?${params.toString()}`;
}

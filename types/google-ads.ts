// types/google-ads.ts — shapes for the Google Ads tab.
//
// Data is sourced from a Google Sheet (populated by an Apps Script that pulls
// from the Google Ads API). Two tabs: "Summary" (one account-level row) and
// "Campaigns" (one row per campaign). Values are already clean (cost in account
// currency, ctr as a percent) — no unit conversion needed.

/** One account-level row from the "Summary" tab. */
export interface GoogleAdsSummary {
  customerId: string;
  accountName: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  avgCpc: number;
  updatedAt: string;
}

/** One row per campaign from the "Campaigns" tab. */
export interface GoogleAdsCampaign {
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  avgCpc: number;
  updatedAt: string;
}

export interface GoogleAdsData {
  /** Account-level totals (Summary tab). Null if the tab is empty. */
  summary: GoogleAdsSummary | null;
  /** Per-campaign rows (Campaigns tab). */
  campaigns: GoogleAdsCampaign[];
  /** ISO time the dashboard computed this payload. */
  lastUpdated: string;
  /** Currency the cost/avgCpc values are in (display only). */
  currency: string;
}

/** Optional KPI overrides (manual, not from Meta). Omitted keys use API-derived values. */
export type DisplayOverridesPayload = {
  amountSpent?: number;
  balanceLeft?: number;
  linkClicks?: number;
  /** Total budget / “total amount” when using sheet-driven balance (balance = total − spent). */
  totalAmount?: number;
  /** Test takers count from Google Sheet (overrides hardcoded constant). */
  testTakers?: number;
  /** Google Ads impressions from Google Sheet — added to Meta impressions for CTR. */
  googleAds?: number;
  /** Reach from Google Sheet — overrides Meta-derived reach total. */
  reach?: number;
};

export type SheetConnectionMeta =
  | { status: 'disabled' }
  | { status: 'ok' }
  | { status: 'error'; error: string };

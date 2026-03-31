/** Optional KPI overrides (manual, not from Meta). Omitted keys use API-derived values. */
export type DisplayOverridesPayload = {
  amountSpent?: number;
  balanceLeft?: number;
  linkClicks?: number;
};

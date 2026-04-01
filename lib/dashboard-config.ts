import type { DashboardData } from '@/types/meta';

/** Header: logo letter in the square */
export const DASHBOARD_BRAND_LETTER = 'D';

/** Header: main title */
export const DASHBOARD_TITLE = 'Destress Dashboard';

/** Performance KPI — fixed display number (not from Meta). Adjust here when the count changes.11 */
export const TEST_TAKERS_COUNT =9516;

/**
 * Client-side spend display (optional). Set `NEXT_PUBLIC_SPEND_MULTIPLIER` / `NEXT_PUBLIC_TOTAL_BUDGET`.
 */
export const SPEND_MULTIPLIER = Number(process.env.NEXT_PUBLIC_SPEND_MULTIPLIER ?? 1);
export const TOTAL_BUDGET = Number(process.env.NEXT_PUBLIC_TOTAL_BUDGET ?? 0);

/** Fallback before first API response */
export const PLACEHOLDER_DASHBOARD_DATA: DashboardData = {
  account: {
    id: '',
    name: '—',
    currency: 'INR',
    balance: 0,
    totalSpent: 0,
    spendCap: 0,
    timezone: '',
  },
  campaigns: [],
  leadsBreakdown: {
    total: 0,
    vote: 0,
    shareYourKissa: 0,
    guessTheColony: 0,
  },
  dmConversations: {
    whatsapp: 0,
    instagram: 0,
  },
  lastUpdated: '',
};

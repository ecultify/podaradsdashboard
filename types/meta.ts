// types/meta.ts — shapes for the Podar website-leads dashboard

export interface MetaInsights {
  impressions: string;
  reach: string;
  spend: string;
  clicks: string;
  cpc: string;
  cpm: string;
  ctr: string;
  frequency: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  date_start: string;
  date_stop: string;
}

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  balance: string;
  amount_spent: string;
  spend_cap: string;
  business_name?: string;
  timezone_name: string;
}

/** Metrics shared by campaign / ad set / ad rows. */
export interface EntityMetrics {
  leads: number;
  costPerLead: number;
  results: number;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  clicks: number;
  linkClicks: number;
  ctr: number;
  insightsAvailable: boolean;
}

export interface DashboardAd extends EntityMetrics {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  thumbnailUrl?: string;
}

export interface DashboardAdSet extends EntityMetrics {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  budget: number;
  budgetType: 'daily' | 'lifetime' | null;
  optimizationGoal?: string;
  ads: DashboardAd[];
}

export interface EngagementMetrics {
  pageEngagement: number;
  postReactions: number;
  postComments: number;
  postSaves: number;
  postShares: number;
  linkClicks: number;
}

export interface DashboardCampaign extends EntityMetrics {
  id: string;
  name: string;
  status: string;
  objective: string;
  budget: number;
  budgetType: 'daily' | 'lifetime' | null;
  currency: string;
  engagement: EngagementMetrics;
  adsets: DashboardAdSet[];
}

export interface DashboardData {
  account: {
    id: string;
    name: string;
    currency: string;
    balance: number;
    totalSpent: number;
    spendCap: number;
    timezone: string;
  };
  campaign: DashboardCampaign;
  datePreset: string;
  /** Actual date window the insights row covers (YYYY-MM-DD), from Meta. */
  dateStart?: string;
  dateStop?: string;
  lastUpdated: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** Cache metadata so the client can show "cached / live". */
  cache?: {
    hit: boolean;
    ageSeconds: number;
    ttlSeconds: number;
  };
}

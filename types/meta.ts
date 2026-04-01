// types/meta.ts — shared shapes for the dashboard (wire to Meta API later)

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


export interface AdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  optimization_goal: string;
  billing_event: string;
  bid_strategy?: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: {
      countries?: string[];
      cities?: { key: string; name: string }[];
    };
  };
  insights?: {
    data: MetaInsights[];
  };
  start_time?: string;
  end_time?: string;
  created_time: string;
  updated_time: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  created_time: string;
  updated_time: string;
  insights?: {
    data: MetaInsights[];
  };
  adsets?: {
    data: AdSet[];
  };
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

export type ResultType =
  | 'lead'
  | 'messaging_conversation_started_7d'
  | 'link_click'
  | 'post_engagement'
  | 'page_engagement'
  | 'video_view'
  | 'landing_page_view'
  | 'omni_purchase'
  | 'add_to_cart'
  | 'onsite_conversion.messaging_conversation_started_7d'
  | 'other';

export interface DashboardAd {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  creativeId?: string;
  thumbnailUrl?: string;
  leads: number;
  results: number;
  resultType: ResultType | null;
  costPerResult: number;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  cpc: number;
  cpm: number;
  ctr: number;
  cpl: number;
  frequency: number;
  dateStart: string;
  dateStop: string;
  insightsAvailable: boolean;
}

export interface DashboardAdSet {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  budget: number;
  budgetType: 'daily' | 'lifetime';
  budgetRemaining: number;
  leads: number;
  results: number;
  resultType: ResultType | null;
  costPerResult: number;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  cpc: number;
  cpm: number;
  ctr: number;
  cpl: number;
  frequency: number;
  optimizationGoal: string;
  dateStart: string;
  dateStop: string;
  insightsAvailable: boolean;
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

export interface DashboardCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  totalLeads: number;
  totalResults: number;
  resultType: ResultType | null;
  costPerResult: number;
  totalImpressions: number;
  totalReach: number;
  totalClicks: number;
  totalSpend: number;
  avgCpl: number;
  avgCtr: number;
  budget: number;
  budgetRemaining: number;
  budgetType: 'daily' | 'lifetime' | null;
  currency: string;
  engagement: EngagementMetrics;
  adsets: DashboardAdSet[];
}

export interface LeadsBreakdown {
  total: number;
  vote: number;
  shareYourKissa: number;
  guessTheColony: number;
}

export interface DmConversations {
  whatsapp: number;
  instagram: number;
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
  campaigns: DashboardCampaign[];
  leadsBreakdown: LeadsBreakdown;
  dmConversations: DmConversations;
  lastUpdated: string;
  filter?: {
    campaignNameContains: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

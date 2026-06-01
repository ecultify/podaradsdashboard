// lib/meta-api.ts — Podar ads dashboard data layer.
//
// Aggregates ALL campaigns in the ad account via account-level insights, pulling
// everything from the Meta Graph API. All KPIs (leads, cost/lead, spend, reach,
// impressions, frequency, CPM, link clicks, CTR) come straight from Meta.

import {
  AdAccount,
  MetaInsights,
  MetaAction,
  EntityMetrics,
  EngagementMetrics,
  DashboardData,
  DashboardCampaign,
} from '@/types/meta';

const META_API_VERSION = 'v25.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/** Meta returns this when the token user must finish facebook.com steps or an asset is restricted. */
const FACEBOOK_LOGIN_CHECKPOINT =
  /cannot access the app|log in to www\.facebook\.com/i;

function formatMetaApiError(endpoint: string, apiMessage: string): string {
  const base = `Meta API error on ${endpoint}: ${apiMessage}`;
  if (!FACEBOOK_LOGIN_CHECKPOINT.test(apiMessage)) return base;
  return (
    `${base}\n\n` +
    'Usually fixed by: (1) Log in to https://www.facebook.com with the same user who owns META_ACCESS_TOKEN and finish any security / "finish setup" prompts. (2) In developers.facebook.com → your app → Roles, add that user as Developer/Tester if the app is in Development mode. (3) Check Ads Manager / Account Quality for restrictions, then regenerate a long-lived token.'
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lead action types in priority order (first present wins — mirrors Ads Manager "Results"). */
const LEAD_ACTION_TYPES = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'leadgen.other',
];

const INSIGHT_FIELDS = [
  'impressions',
  'reach',
  'spend',
  'clicks',
  'cpm',
  'ctr',
  'frequency',
  'actions',
  'cost_per_action_type',
  'date_start',
  'date_stop',
].join(',');

type InsightsWithIds = MetaInsights & {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
};

const EMPTY_METRICS: EntityMetrics = {
  leads: 0,
  costPerLead: 0,
  results: 0,
  spend: 0,
  impressions: 0,
  reach: 0,
  frequency: 0,
  cpm: 0,
  clicks: 0,
  linkClicks: 0,
  ctr: 0,
  insightsAvailable: false,
};

class MetaApiClient {
  private accessToken: string;
  private adAccountId: string;

  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN || '';
    this.adAccountId = process.env.META_AD_ACCOUNT_ID || '';

    if (!this.accessToken || !this.adAccountId) {
      throw new Error(
        'META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in environment variables'
      );
    }
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const url = new URL(`${META_BASE_URL}${endpoint}`);
      url.searchParams.set('access_token', this.accessToken);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (response.ok) return response.json();

      const errorBody = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number };
      };
      const code = errorBody?.error?.code;
      const isRateLimit = code === 17 || code === 32 || code === 80004;

      if (isRateLimit && attempt < maxAttempts - 1) {
        await sleep(15000 * Math.pow(2, attempt));
        continue;
      }

      const msg = errorBody?.error?.message || `${response.status} ${response.statusText}`;
      throw new Error(formatMetaApiError(endpoint, msg));
    }

    throw new Error('Meta API: exceeded rate-limit retries');
  }

  /** Paginate any /insights edge into a flat array. */
  private async fetchInsights(
    edge: string,
    params: Record<string, string>
  ): Promise<InsightsWithIds[]> {
    const merged: InsightsWithIds[] = [];
    let after: string | undefined;

    for (;;) {
      const pageParams: Record<string, string> = { ...params, limit: '200' };
      if (after) pageParams.after = after;

      const res = await this.fetch<{
        data?: InsightsWithIds[];
        paging?: { cursors?: { after?: string } };
      }>(edge, pageParams);

      const chunk = res.data ?? [];
      merged.push(...chunk);
      after = res.paging?.cursors?.after;
      if (!after || chunk.length === 0) break;
    }

    return merged;
  }

  private async getAccount(): Promise<AdAccount> {
    return this.fetch<AdAccount>(`/${this.adAccountId}`, {
      fields:
        'id,name,account_status,currency,balance,amount_spent,spend_cap,business_name,timezone_name',
    });
  }

  // --- metric extraction -----------------------------------------------------

  private leadCount(actions?: MetaAction[]): { count: number; type: string | null } {
    if (!actions) return { count: 0, type: null };
    for (const type of LEAD_ACTION_TYPES) {
      const match = actions.find((a) => a.action_type === type);
      if (match) return { count: parseInt(match.value, 10) || 0, type };
    }
    return { count: 0, type: null };
  }

  private actionValue(actions: MetaAction[] | undefined, type: string): number {
    const match = actions?.find((a) => a.action_type === type);
    return match ? parseInt(match.value, 10) || 0 : 0;
  }

  private extractEngagement(ins: MetaInsights | null): EngagementMetrics {
    const a = ins?.actions;
    return {
      pageEngagement: this.actionValue(a, 'page_engagement'),
      postReactions: this.actionValue(a, 'post_reaction'),
      postComments: this.actionValue(a, 'comment'),
      postSaves: this.actionValue(a, 'onsite_conversion.post_save'),
      postShares: this.actionValue(a, 'post'),
      linkClicks: this.actionValue(a, 'link_click'),
    };
  }

  private buildMetrics(ins: MetaInsights | null): EntityMetrics {
    if (!ins) return { ...EMPTY_METRICS };

    const { count: leads, type: leadType } = this.leadCount(ins.actions);
    const spend = parseFloat(ins.spend || '0');

    let costPerLead = 0;
    if (leadType) {
      const cpl = ins.cost_per_action_type?.find((a) => a.action_type === leadType);
      costPerLead = cpl ? parseFloat(cpl.value) : leads > 0 ? spend / leads : 0;
    } else if (leads > 0) {
      costPerLead = spend / leads;
    }

    return {
      leads,
      costPerLead,
      results: leads,
      spend,
      impressions: parseInt(ins.impressions || '0', 10),
      reach: parseInt(ins.reach || '0', 10),
      frequency: parseFloat(ins.frequency || '0'),
      cpm: parseFloat(ins.cpm || '0'),
      clicks: parseInt(ins.clicks || '0', 10),
      linkClicks: this.actionValue(ins.actions, 'link_click'),
      ctr: parseFloat(ins.ctr || '0'),
      insightsAvailable: true,
    };
  }

  // --- assembly --------------------------------------------------------------

  /**
   * Aggregate ALL campaigns in the ad account. We query account-level insights,
   * which Meta returns as a single row already summed across every campaign
   * (and with reach de-duplicated account-wide). The result is mapped into the
   * same DashboardData shape so the dashboard UI is unchanged.
   */
  async getDashboardData(datePreset: string = 'maximum'): Promise<DashboardData> {
    const [account, accountRows] = await Promise.all([
      this.getAccount(),
      // No `level` → defaults to account level: one aggregated row for all campaigns.
      this.fetchInsights(`/${this.adAccountId}/insights`, {
        date_preset: datePreset,
        fields: INSIGHT_FIELDS,
      }),
    ]);

    const aggRow = accountRows[0] ?? null;
    const metrics = this.buildMetrics(aggRow);

    const dashboardCampaign: DashboardCampaign = {
      id: account.id,
      name: 'All Campaigns',
      status: '',
      objective: '',
      budget: 0,
      budgetType: null,
      currency: account.currency || 'INR',
      engagement: this.extractEngagement(aggRow),
      adsets: [],
      ...metrics,
    };

    return {
      account: {
        id: account.id,
        name: account.name || account.business_name || 'Ad Account',
        currency: account.currency || 'INR',
        balance: parseFloat(account.balance || '0') / 100,
        totalSpent: parseFloat(account.amount_spent || '0') / 100,
        spendCap: parseFloat(account.spend_cap || '0') / 100,
        timezone: account.timezone_name || 'Asia/Kolkata',
      },
      campaign: dashboardCampaign,
      datePreset,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Exchange short-lived token for long-lived token (used by the auth route).
  static async exchangeToken(
    shortLivedToken: string,
    appId: string,
    appSecret: string
  ): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const url = new URL(`${META_BASE_URL}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error?.error?.message || 'Token exchange failed');
    }
    return response.json();
  }
}

export default MetaApiClient;

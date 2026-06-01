// lib/meta-api.ts — Podar website-leads dashboard data layer.
//
// Tracks a SINGLE campaign (website leads) -> its ad sets -> their ads, pulling
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
  DashboardAdSet,
  DashboardAd,
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

interface RawCampaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface RawAdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  campaign_id?: string;
}

interface RawAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  adset_id?: string;
  creative?: { id?: string; thumbnail_url?: string };
}

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

function budgetFrom(daily?: string, lifetime?: string): {
  budget: number;
  budgetType: 'daily' | 'lifetime' | null;
} {
  if (daily && parseFloat(daily) > 0) {
    return { budget: parseFloat(daily) / 100, budgetType: 'daily' };
  }
  if (lifetime && parseFloat(lifetime) > 0) {
    return { budget: parseFloat(lifetime) / 100, budgetType: 'lifetime' };
  }
  return { budget: 0, budgetType: null };
}

class MetaApiClient {
  private accessToken: string;
  private adAccountId: string;
  private campaignId: string;
  private adsetIds: string[];

  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN || '';
    this.adAccountId = process.env.META_AD_ACCOUNT_ID || '';
    this.campaignId = process.env.META_CAMPAIGN_ID_WEBSITE_LEADS?.trim() || '';

    const rawAdsets = process.env.META_ADSET_IDS?.trim() || '';
    this.adsetIds = rawAdsets
      ? rawAdsets.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    if (!this.accessToken || !this.adAccountId) {
      throw new Error(
        'META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in environment variables'
      );
    }
    if (!this.campaignId) {
      throw new Error('META_CAMPAIGN_ID_WEBSITE_LEADS must be set in environment variables');
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

  private async getCampaign(): Promise<RawCampaign> {
    return this.fetch<RawCampaign>(`/${this.campaignId}`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
    });
  }

  private async getAdSets(): Promise<RawAdSet[]> {
    const res = await this.fetch<{ data?: RawAdSet[] }>(`/${this.campaignId}/adsets`, {
      fields:
        'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,campaign_id',
      limit: '200',
    });
    let adsets = res.data ?? [];

    // If specific ad sets are configured, keep only those and honour their order.
    if (this.adsetIds.length > 0) {
      const byId = new Map(adsets.map((a) => [a.id, a]));
      adsets = this.adsetIds
        .map((id) => byId.get(id))
        .filter((a): a is RawAdSet => !!a);
    }
    return adsets;
  }

  private async getAds(): Promise<RawAd[]> {
    const res = await this.fetch<{ data?: RawAd[] }>(`/${this.campaignId}/ads`, {
      fields: 'id,name,status,effective_status,adset_id,creative{id,thumbnail_url}',
      limit: '300',
    });
    return res.data ?? [];
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

  async getDashboardData(datePreset: string = 'maximum'): Promise<DashboardData> {
    // 1. Account + campaign + entity lists (small calls).
    const [account, campaign, adsetsRaw, adsRaw] = await Promise.all([
      this.getAccount(),
      this.getCampaign(),
      this.getAdSets(),
      this.getAds(),
    ]);

    // 2. Insights at all three levels for this campaign, in parallel.
    // The entity-id field MUST be requested per level, otherwise rows come back
    // without an id and can't be matched to their ad set / ad.
    const [campaignRows, adsetRows, adRows] = await Promise.all([
      this.fetchInsights(`/${this.campaignId}/insights`, {
        date_preset: datePreset,
        level: 'campaign',
        fields: `${INSIGHT_FIELDS},campaign_id`,
      }),
      this.fetchInsights(`/${this.campaignId}/insights`, {
        date_preset: datePreset,
        level: 'adset',
        fields: `${INSIGHT_FIELDS},adset_id`,
      }),
      this.fetchInsights(`/${this.campaignId}/insights`, {
        date_preset: datePreset,
        level: 'ad',
        fields: `${INSIGHT_FIELDS},ad_id,adset_id`,
      }),
    ]);

    const adsetInsightsById = new Map<string, MetaInsights>();
    for (const row of adsetRows) if (row.adset_id) adsetInsightsById.set(row.adset_id, row);

    const adInsightsById = new Map<string, MetaInsights>();
    for (const row of adRows) if (row.ad_id) adInsightsById.set(row.ad_id, row);

    // Group ads under their ad set.
    const adsByAdSet = new Map<string, DashboardAd[]>();
    for (const ad of adsRaw) {
      const metrics = this.buildMetrics(adInsightsById.get(ad.id) ?? null);
      const dashAd: DashboardAd = {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effectiveStatus: ad.effective_status,
        thumbnailUrl: ad.creative?.thumbnail_url,
        ...metrics,
      };
      const key = ad.adset_id ?? '';
      const list = adsByAdSet.get(key) ?? [];
      list.push(dashAd);
      adsByAdSet.set(key, list);
    }

    const adsets: DashboardAdSet[] = adsetsRaw.map((adset) => {
      const metrics = this.buildMetrics(adsetInsightsById.get(adset.id) ?? null);
      const { budget, budgetType } = budgetFrom(adset.daily_budget, adset.lifetime_budget);
      const ads = (adsByAdSet.get(adset.id) ?? []).sort((a, b) => b.leads - a.leads);
      return {
        id: adset.id,
        name: adset.name,
        status: adset.status,
        effectiveStatus: adset.effective_status,
        budget,
        budgetType,
        optimizationGoal: adset.optimization_goal,
        ads,
        ...metrics,
      };
    });

    const campaignRow = campaignRows[0] ?? null;
    const campaignMetrics = this.buildMetrics(campaignRow);
    const { budget, budgetType } = budgetFrom(campaign.daily_budget, campaign.lifetime_budget);

    const dashboardCampaign: DashboardCampaign = {
      id: campaign.id,
      name: campaign.name,
      status: campaign.effective_status,
      objective: campaign.objective,
      budget,
      budgetType,
      currency: account.currency || 'INR',
      engagement: this.extractEngagement(campaignRow),
      adsets,
      ...campaignMetrics,
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

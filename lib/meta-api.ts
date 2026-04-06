// lib/meta-api.ts

import {
  AdAccount,
  Campaign,
  AdSet,
  MetaInsights,
  MetaAction,
  DashboardData,
  DashboardCampaign,
  DashboardAdSet,
  DashboardAd,
  ResultType,
  EngagementMetrics,
} from '@/types/meta';

const META_API_VERSION = 'v25.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/** Meta returns this when the token user must complete facebook.com steps or an asset is restricted. */
const FACEBOOK_LOGIN_CHECKPOINT =
  /cannot access the app|log in to www\.facebook\.com/i;

function formatMetaApiError(endpoint: string, apiMessage: string): string {
  const base = `Meta API error on ${endpoint}: ${apiMessage}`;
  if (!FACEBOOK_LOGIN_CHECKPOINT.test(apiMessage)) return base;
  return (
    `${base}\n\n` +
    'What usually fixes this: (1) Log in to https://www.facebook.com with the same person who owns META_ACCESS_TOKEN and finish any security or “finish setup” prompts. (2) In https://developers.facebook.com → your app → Roles, add that user as Developer or Tester if the app is still in Development mode. (3) Check Ads Manager / Account Quality for ad account or Business restrictions, then regenerate a long-lived token after Meta clears the block.'
  );
}

/** Delay between sequential Meta API calls (rate-limit safety net). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type InsightsWithEntityIds = MetaInsights & {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
};

type AdSetWithCampaignId = AdSet & { campaign_id?: string };

type MetaAdRaw = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  adset_id?: string;
  creative?: { id?: string; thumbnail_url?: string; name?: string };
};

/**
 * Minimal insight fields for the dashboard: reach, impressions, spend (fallback if no Sheet),
 * and `actions` for engagement + leads/messaging. Omits cpc/cpm/ctr/frequency/clicks to reduce payload and Graph cost.
 */
const INSIGHT_FIELDS_BASE = [
  'impressions',
  'reach',
  'spend',
  'actions',
  'date_start',
  'date_stop',
];

// level=campaign only allows campaign_id (adset_id is invalid here)
const INSIGHT_FIELDS_CAMPAIGN = [...INSIGHT_FIELDS_BASE, 'campaign_id'].join(',');

// level=adset allows campaign_id + adset_id
const INSIGHT_FIELDS = [...INSIGHT_FIELDS_BASE, 'campaign_id', 'adset_id'].join(',');

// level=ad allows all three
const INSIGHT_FIELDS_AD = [...INSIGHT_FIELDS_BASE, 'campaign_id', 'adset_id', 'ad_id'].join(',');

class MetaApiClient {
  private accessToken: string;
  private adAccountId: string;

  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN || '';
    this.adAccountId = process.env.META_AD_ACCOUNT_ID || '';

    if (!this.accessToken || !this.adAccountId) {
      throw new Error('META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in environment variables');
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

      const response = await fetch(url.toString(), {
        cache: 'no-store',
      });

      if (response.ok) {
        return response.json();
      }

      const errorBody = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number };
      };
      const code = errorBody?.error?.code;
      const isRateLimit = code === 17 || code === 32;

      if (isRateLimit && attempt < maxAttempts - 1) {
        await sleep(30000 * Math.pow(2, attempt));
        continue;
      }

      const msg = errorBody?.error?.message || `${response.status} ${response.statusText}`;
      throw new Error(formatMetaApiError(endpoint, msg));
    }

    throw new Error('Meta API: exceeded rate-limit retries');
  }

  /** Paginated account insights (handles large accounts). */
  private async fetchAccountInsightsBatched(
    baseParams: Record<string, string>
  ): Promise<InsightsWithEntityIds[]> {
    const merged: InsightsWithEntityIds[] = [];
    let after: string | undefined;

    for (;;) {
      const pageParams: Record<string, string> = {
        ...baseParams,
        limit: '500',
      };
      if (after) {
        pageParams.after = after;
      }

      const res = await this.fetch<{
        data?: InsightsWithEntityIds[];
        paging?: { cursors?: { after?: string } };
      }>(`/${this.adAccountId}/insights`, pageParams);

      const chunk = res.data ?? [];
      merged.push(...chunk);
      after = res.paging?.cursors?.after;
      if (!after || chunk.length === 0) {
        break;
      }
    }

    return merged;
  }

  // Get ad account details
  async getAdAccount(): Promise<AdAccount> {
    return this.fetch<AdAccount>(`/${this.adAccountId}`, {
      fields: 'id,name,account_status,currency,balance,amount_spent,spend_cap,business_name,timezone_name',
    });
  }

  private static readonly CAMPAIGN_LIST_FIELDS = [
    'id',
    'name',
    'status',
    'effective_status',
    'objective',
    'daily_budget',
    'lifetime_budget',
    'budget_remaining',
    'created_time',
    'updated_time',
  ].join(',');

  private static readonly CAMPAIGN_STATUS_FILTER = JSON.stringify([
    {
      field: 'effective_status',
      operator: 'IN',
      value: ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
    },
  ]);

  /** Paginated: all campaigns matching the account’s active-status filter (for name filtering / full list). */
  private async fetchAllCampaignsList(): Promise<Campaign[]> {
    const merged: Campaign[] = [];
    let after: string | undefined;

    for (;;) {
      const params: Record<string, string> = {
        fields: MetaApiClient.CAMPAIGN_LIST_FIELDS,
        filtering: MetaApiClient.CAMPAIGN_STATUS_FILTER,
        limit: '100',
      };
      if (after) {
        params.after = after;
      }

      const response = await this.fetch<{
        data?: Campaign[];
        paging?: { cursors?: { after?: string } };
      }>(`/${this.adAccountId}/campaigns`, params);

      const chunk = response.data ?? [];
      merged.push(...chunk);
      after = response.paging?.cursors?.after;
      if (!after || chunk.length === 0) {
        break;
      }
    }

    return merged;
  }

  // Get all campaigns (including drafts/in-review via extended effective_status filter)
  async getCampaigns(_datePreset: string = 'last_30d'): Promise<Campaign[]> {
    return this.fetchAllCampaignsList();
  }

  /** Env: META_CAMPAIGN_NAME_FILTER or NEXT_PUBLIC_META_CAMPAIGN_NAME_FILTER — substring match on campaign name (case-insensitive). */
  private getCampaignNameFilterFromEnv(): string | undefined {
    const a = process.env.META_CAMPAIGN_NAME_FILTER?.trim();
    const b = process.env.NEXT_PUBLIC_META_CAMPAIGN_NAME_FILTER?.trim();
    return a || b || undefined;
  }

  /**
   * Destress dashboard: three fixed campaign IDs from Ads Manager
   * (conversations / website leads / link clicks). When all are set, the API
   * uses only these campaigns instead of listing by name filter.
   */
  private getDestressCampaignIdsFromEnv(): {
    conversations: string;
    websiteLeads: string;
    linkClicks: string;
  } | null {
    const conversations = process.env.META_CAMPAIGN_ID_CONVERSATIONS?.trim();
    const websiteLeads = process.env.META_CAMPAIGN_ID_WEBSITE_LEADS?.trim();
    const linkClicks = process.env.META_CAMPAIGN_ID_LINK_CLICKS?.trim();
    if (conversations && websiteLeads && linkClicks) {
      return { conversations, websiteLeads, linkClicks };
    }
    return null;
  }

  /** Load one campaign by ID (avoids listing every campaign when filtering to a single campaign). */
  private async fetchCampaignById(campaignId: string): Promise<Campaign | null> {
    try {
      return await this.fetch<Campaign>(`/${campaignId}`, {
        fields: [
          'id',
          'name',
          'status',
          'effective_status',
          'objective',
          'daily_budget',
          'lifetime_budget',
          'budget_remaining',
          'created_time',
          'updated_time',
        ].join(','),
      });
    } catch {
      return null;
    }
  }

  /** All campaign-level insights for selected campaigns in one batched query. */
  private async getAccountCampaignInsightsBatch(
    campaignIds: string[],
    datePreset: string
  ): Promise<InsightsWithEntityIds[]> {
    if (campaignIds.length === 0) {
      return [];
    }

    return this.fetchAccountInsightsBatched({
      level: 'campaign',
      fields: INSIGHT_FIELDS_CAMPAIGN,
      date_preset: datePreset,
      filtering: JSON.stringify([
        { field: 'campaign.id', operator: 'IN', value: campaignIds },
      ]),
    });
  }

  /** All adset-level insights for adsets under selected campaigns in one batched query. */
  private async getAccountAdSetInsightsBatch(
    campaignIds: string[],
    datePreset: string
  ): Promise<InsightsWithEntityIds[]> {
    if (campaignIds.length === 0) {
      return [];
    }

    return this.fetchAccountInsightsBatched({
      level: 'adset',
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      filtering: JSON.stringify([
        { field: 'campaign.id', operator: 'IN', value: campaignIds },
      ]),
    });
  }

  /** All ad-level insights for ads under selected campaigns in one batched query. */
  private async getAccountAdInsightsBatch(
    campaignIds: string[],
    datePreset: string
  ): Promise<InsightsWithEntityIds[]> {
    if (campaignIds.length === 0) {
      return [];
    }

    return this.fetchAccountInsightsBatched({
      level: 'ad',
      fields: INSIGHT_FIELDS_AD,
      date_preset: datePreset,
      filtering: JSON.stringify([
        { field: 'campaign.id', operator: 'IN', value: campaignIds },
      ]),
    });
  }

  /** All adsets under the given campaigns — no status filter (includes drafts, archived, etc.). */
  private async getAllAdSetsForCampaigns(campaignIds: string[]): Promise<AdSetWithCampaignId[]> {
    if (campaignIds.length === 0) {
      return [];
    }

    const adsetFields = [
      'id',
      'name',
      'status',
      'effective_status',
      'daily_budget',
      'lifetime_budget',
      'budget_remaining',
      'optimization_goal',
      'billing_event',
      'bid_strategy',
      'targeting',
      'start_time',
      'end_time',
      'created_time',
      'updated_time',
      'campaign_id',
    ].join(',');

    const merged: AdSetWithCampaignId[] = [];
    let after: string | undefined;

    for (;;) {
      const params: Record<string, string> = {
        fields: adsetFields,
        filtering: JSON.stringify([
          { field: 'campaign.id', operator: 'IN', value: campaignIds },
        ]),
        limit: '500',
      };
      if (after) {
        params.after = after;
      }

      const response = await this.fetch<{ data: AdSetWithCampaignId[]; paging?: { cursors?: { after?: string } } }>(
        `/${this.adAccountId}/adsets`,
        params
      );

      const chunk = response.data ?? [];
      merged.push(...chunk);
      after = response.paging?.cursors?.after;
      if (!after || chunk.length === 0) {
        break;
      }
    }

    return merged;
  }

  /** All ads under the given campaigns — no effective_status filter. */
  private async getAllAdsForCampaigns(campaignIds: string[]): Promise<MetaAdRaw[]> {
    if (campaignIds.length === 0) {
      return [];
    }

    const adFields = [
      'id',
      'name',
      'status',
      'effective_status',
      'adset_id',
      'creative{id,thumbnail_url,name}',
    ].join(',');

    const merged: MetaAdRaw[] = [];
    let after: string | undefined;

    for (;;) {
      const params: Record<string, string> = {
        fields: adFields,
        filtering: JSON.stringify([
          { field: 'campaign.id', operator: 'IN', value: campaignIds },
        ]),
        limit: '500',
      };
      if (after) {
        params.after = after;
      }

      const response = await this.fetch<{ data: MetaAdRaw[]; paging?: { cursors?: { after?: string } } }>(
        `/${this.adAccountId}/ads`,
        params
      );

      const chunk = response.data ?? [];
      merged.push(...chunk);
      after = response.paging?.cursors?.after;
      if (!after || chunk.length === 0) {
        break;
      }
    }

    return merged;
  }

  // Get campaign insights
  async getCampaignInsights(
    campaignId: string,
    datePreset: string = 'last_30d'
  ): Promise<MetaInsights | null> {
    try {
      const response = await this.fetch<{ data: MetaInsights[] }>(
        `/${campaignId}/insights`,
        {
          fields: [
            'impressions',
            'reach',
            'spend',
            'clicks',
            'cpc',
            'cpm',
            'ctr',
            'frequency',
            'actions',
            'cost_per_action_type',
            'date_start',
            'date_stop',
          ].join(','),
          date_preset: datePreset,
        }
      );
      return response.data?.[0] || null;
    } catch {
      return null;
    }
  }

  // Get adsets for a campaign — all statuses (no effective_status filter)
  async getAdSets(campaignId: string, datePreset: string = 'last_30d'): Promise<AdSet[]> {
    const response = await this.fetch<{ data: AdSet[] }>(
      `/${campaignId}/adsets`,
      {
        fields: [
          'id',
          'name',
          'status',
          'effective_status',
          'daily_budget',
          'lifetime_budget',
          'budget_remaining',
          'optimization_goal',
          'billing_event',
          'bid_strategy',
          'targeting',
          'start_time',
          'end_time',
          'created_time',
          'updated_time',
        ].join(','),
        limit: '500',
      }
    );

    return response.data;
  }

  // Get adset insights
  async getAdSetInsights(
    adsetId: string,
    datePreset: string = 'last_30d'
  ): Promise<MetaInsights | null> {
    try {
      const response = await this.fetch<{ data: MetaInsights[] }>(
        `/${adsetId}/insights`,
        {
          fields: [
            'impressions',
            'reach',
            'spend',
            'clicks',
            'cpc',
            'cpm',
            'ctr',
            'frequency',
            'actions',
            'cost_per_action_type',
            'date_start',
            'date_stop',
          ].join(','),
          date_preset: datePreset,
        }
      );
      return response.data?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Priority-ordered list: the first match in the actions array wins as the
   * "primary result" for a campaign/adset/ad. This mirrors Meta Ads Manager's
   * Results column, which picks the action matching the campaign objective.
   */
  private static readonly RESULT_PRIORITY: { types: string[]; resultType: ResultType }[] = [
    { types: ['lead', 'leadgen.other', 'onsite_conversion.lead_grouped'], resultType: 'lead' },
    {
      types: [
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d',
      ],
      resultType: 'messaging_conversation_started_7d',
    },
    { types: ['link_click'], resultType: 'link_click' },
    { types: ['post_engagement'], resultType: 'post_engagement' },
    { types: ['page_engagement'], resultType: 'page_engagement' },
    { types: ['video_view'], resultType: 'video_view' },
    { types: ['landing_page_view'], resultType: 'landing_page_view' },
    { types: ['omni_purchase', 'purchase'], resultType: 'omni_purchase' },
    { types: ['omni_add_to_cart', 'add_to_cart'], resultType: 'add_to_cart' },
  ];

  /** Find the primary result from the actions array: { count, type, costPer }. */
  private static readonly MESSAGING_ACTION_TYPES = [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
  ];

  private getMessagingCountFromInsights(insights: MetaInsights | null): number {
    if (!insights?.actions) return 0;
    for (const actionType of MetaApiClient.MESSAGING_ACTION_TYPES) {
      const a = insights.actions.find((x) => x.action_type === actionType);
      if (a) return parseInt(a.value, 10);
    }
    return 0;
  }

  private getPrimaryResult(
    actions: MetaAction[] | undefined,
    costActions: MetaAction[] | undefined
  ): { count: number; type: ResultType | null; costPer: number } {
    if (!actions || actions.length === 0) {
      return { count: 0, type: null, costPer: 0 };
    }

    for (const bucket of MetaApiClient.RESULT_PRIORITY) {
      const match = actions.find((a) => bucket.types.includes(a.action_type));
      if (match) {
        const costMatch = costActions?.find((a) => a.action_type === match.action_type);
        return {
          count: parseInt(match.value, 10),
          type: bucket.resultType,
          costPer: costMatch ? parseFloat(costMatch.value) : 0,
        };
      }
    }

    // Fallback: pick the first action that isn't a generic aggregate
    const skip = new Set(['actions:omni_view_content', 'offsite_conversion', 'page_view']);
    const fallback = actions.find((a) => !skip.has(a.action_type));
    if (fallback) {
      const costMatch = costActions?.find((a) => a.action_type === fallback.action_type);
      return {
        count: parseInt(fallback.value, 10),
        type: 'other',
        costPer: costMatch ? parseFloat(costMatch.value) : 0,
      };
    }

    return { count: 0, type: null, costPer: 0 };
  }

  private getActionCount(insights: MetaInsights | null, actionType: string): number {
    if (!insights?.actions) return 0;
    const action = insights.actions.find((a) => a.action_type === actionType);
    return action ? parseInt(action.value, 10) : 0;
  }

  private extractEngagement(insights: MetaInsights | null): EngagementMetrics {
    return {
      pageEngagement: this.getActionCount(insights, 'page_engagement'),
      postReactions: this.getActionCount(insights, 'post_reaction'),
      postComments: this.getActionCount(insights, 'comment'),
      postSaves: this.getActionCount(insights, 'onsite_conversion.post_save'),
      postShares: this.getActionCount(insights, 'post'),
      linkClicks: this.getActionCount(insights, 'link_click'),
    };
  }

  private getLeadCount(insights: MetaInsights | null): number {
    if (!insights?.actions) return 0;
    const leadAction = insights.actions.find(
      (a) =>
        a.action_type === 'lead' ||
        a.action_type === 'leadgen.other' ||
        a.action_type === 'onsite_conversion.lead_grouped'
    );
    return leadAction ? parseInt(leadAction.value, 10) : 0;
  }

  private getCostPerLead(insights: MetaInsights | null): number {
    if (!insights?.cost_per_action_type) return 0;
    const cplAction = insights.cost_per_action_type.find(
      (a) =>
        a.action_type === 'lead' ||
        a.action_type === 'leadgen.other' ||
        a.action_type === 'onsite_conversion.lead_grouped'
    );
    return cplAction ? parseFloat(cplAction.value) : 0;
  }

  private processAdSet(adset: AdSet, insights: MetaInsights | null): DashboardAdSet {
    const hasDailyBudget = !!adset.daily_budget;
    const budget = hasDailyBudget
      ? parseFloat(adset.daily_budget || '0') / 100
      : parseFloat(adset.lifetime_budget || '0') / 100;

    const insightsAvailable = insights != null;
    const primary = insightsAvailable
      ? this.getPrimaryResult(insights?.actions, insights?.cost_per_action_type)
      : { count: 0, type: null as ResultType | null, costPer: 0 };

    return {
      id: adset.id,
      name: adset.name,
      status: adset.status,
      effectiveStatus: adset.effective_status,
      budget,
      budgetType: hasDailyBudget ? 'daily' : 'lifetime',
      budgetRemaining: parseFloat(adset.budget_remaining || '0') / 100,
      leads: insightsAvailable ? this.getLeadCount(insights) : 0,
      results: primary.count,
      resultType: primary.type,
      costPerResult: primary.costPer,
      impressions: insightsAvailable ? parseInt(insights?.impressions || '0', 10) : 0,
      reach: insightsAvailable ? parseInt(insights?.reach || '0', 10) : 0,
      clicks: insightsAvailable ? parseInt(insights?.clicks || '0', 10) : 0,
      spend: insightsAvailable ? parseFloat(insights?.spend || '0') : 0,
      cpc: insightsAvailable ? parseFloat(insights?.cpc || '0') : 0,
      cpm: insightsAvailable ? parseFloat(insights?.cpm || '0') : 0,
      ctr: insightsAvailable ? parseFloat(insights?.ctr || '0') : 0,
      cpl: insightsAvailable ? this.getCostPerLead(insights) : 0,
      frequency: insightsAvailable ? parseFloat(insights?.frequency || '0') : 0,
      optimizationGoal: adset.optimization_goal,
      dateStart: insightsAvailable ? insights?.date_start || '' : '',
      dateStop: insightsAvailable ? insights?.date_stop || '' : '',
      insightsAvailable,
      ads: [],
    };
  }

  private processAd(ad: MetaAdRaw, insights: MetaInsights | null): DashboardAd {
    const insightsAvailable = insights != null;
    const primary = insightsAvailable
      ? this.getPrimaryResult(insights?.actions, insights?.cost_per_action_type)
      : { count: 0, type: null as ResultType | null, costPer: 0 };

    return {
      id: ad.id,
      name: ad.name,
      status: ad.status,
      effectiveStatus: ad.effective_status,
      creativeId: ad.creative?.id,
      thumbnailUrl: ad.creative?.thumbnail_url,
      leads: insightsAvailable ? this.getLeadCount(insights) : 0,
      results: primary.count,
      resultType: primary.type,
      costPerResult: primary.costPer,
      impressions: insightsAvailable ? parseInt(insights?.impressions || '0', 10) : 0,
      reach: insightsAvailable ? parseInt(insights?.reach || '0', 10) : 0,
      clicks: insightsAvailable ? parseInt(insights?.clicks || '0', 10) : 0,
      spend: insightsAvailable ? parseFloat(insights?.spend || '0') : 0,
      cpc: insightsAvailable ? parseFloat(insights?.cpc || '0') : 0,
      cpm: insightsAvailable ? parseFloat(insights?.cpm || '0') : 0,
      ctr: insightsAvailable ? parseFloat(insights?.ctr || '0') : 0,
      cpl: insightsAvailable ? this.getCostPerLead(insights) : 0,
      frequency: insightsAvailable ? parseFloat(insights?.frequency || '0') : 0,
      dateStart: insightsAvailable ? insights?.date_start || '' : '',
      dateStop: insightsAvailable ? insights?.date_stop || '' : '',
      insightsAvailable,
    };
  }

  /** Destress: fixed three campaigns — aggregate KPIs; leads from website-leads ID; DMs from conversations ID (ad set names). */
  private async getDashboardDataDestress(
    datePreset: string,
    ids: { conversations: string; websiteLeads: string; linkClicks: string }
  ): Promise<DashboardData> {
    const account = await this.getAdAccount();
    await sleep(100);

    const [cConv, cLeads, cLink] = await Promise.all([
      this.fetchCampaignById(ids.conversations),
      this.fetchCampaignById(ids.websiteLeads),
      this.fetchCampaignById(ids.linkClicks),
    ]);

    if (!cConv || !cLeads || !cLink) {
      const missing = [
        !cConv && 'META_CAMPAIGN_ID_CONVERSATIONS',
        !cLeads && 'META_CAMPAIGN_ID_WEBSITE_LEADS',
        !cLink && 'META_CAMPAIGN_ID_LINK_CLICKS',
      ].filter(Boolean);
      throw new Error(
        `Campaign not found or not accessible (${missing.join(', ')}). Verify IDs and token permissions.`
      );
    }

    const campaigns: Campaign[] = [cConv, cLeads, cLink];
    const campaignIds = campaigns.map((c) => c.id);
    const nameFilter = this.getCampaignNameFilterFromEnv();

    await sleep(100);

    const campaignInsightsRows =
      campaignIds.length > 0
        ? await this.getAccountCampaignInsightsBatch(campaignIds, datePreset)
        : [];

    const campaignInsightsById = new Map<string, MetaInsights>();
    for (const row of campaignInsightsRows) {
      if (row.campaign_id) {
        campaignInsightsById.set(row.campaign_id, row);
      }
    }

    const dashboardCampaigns: DashboardCampaign[] = campaigns.map((campaign) => {
      const ci = campaignInsightsById.get(campaign.id) ?? null;
      const primary = ci
        ? this.getPrimaryResult(ci.actions, ci.cost_per_action_type)
        : { count: 0, type: null as ResultType | null, costPer: 0 };

      const totalImpressions = parseInt(ci?.impressions || '0', 10);
      const totalReach = parseInt(ci?.reach || '0', 10);
      const totalClicks = parseInt(ci?.clicks || '0', 10);
      const totalSpend = parseFloat(ci?.spend || '0');
      const totalLeads = ci ? this.getLeadCount(ci) : 0;
      const totalResults = primary.count;
      const costPerResult = totalResults > 0 ? totalSpend / totalResults : 0;

      const hasDailyBudget = !!campaign.daily_budget;
      const hasLifetimeBudget =
        !!campaign.lifetime_budget && parseFloat(campaign.lifetime_budget || '0') > 0;
      const budget = hasDailyBudget
        ? parseFloat(campaign.daily_budget || '0') / 100
        : parseFloat(campaign.lifetime_budget || '0') / 100;
      const budgetType: 'daily' | 'lifetime' | null = hasDailyBudget
        ? 'daily'
        : hasLifetimeBudget
        ? 'lifetime'
        : null;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.effective_status,
        objective: campaign.objective,
        totalLeads,
        totalResults,
        resultType: primary.type,
        costPerResult,
        totalImpressions,
        totalReach,
        totalClicks,
        totalSpend,
        avgCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
        avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        budget,
        budgetRemaining: parseFloat(campaign.budget_remaining || '0') / 100,
        budgetType,
        currency: account.currency || 'INR',
        engagement: this.extractEngagement(ci),
        adsets: [],
      };
    });

    /** Website leads: same as Ads Manager “Results → Website leads” — campaign-level lead actions on the leads campaign. */
    const wlCampaign = dashboardCampaigns.find((c) => c.id === ids.websiteLeads);
    const leadsBreakdown = {
      total: wlCampaign?.totalLeads ?? 0,
      vote: 0,
      shareYourKissa: 0,
      guessTheColony: 0,
    };

    /** Campaign-level messaging only (avoids a second adset-level insights request). */
    const ciConv = campaignInsightsById.get(ids.conversations);
    const dmConversations = {
      whatsapp: this.getMessagingCountFromInsights(ciConv ?? null),
      instagram: 0,
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
      campaigns: dashboardCampaigns,
      leadsBreakdown,
      dmConversations,
      lastUpdated: new Date().toISOString(),
      ...(nameFilter ? { filter: { campaignNameContains: nameFilter } } : {}),
    };
  }

  // Main method: Get complete dashboard data
  async getDashboardData(datePreset: string = 'last_30d', campaignId?: string): Promise<DashboardData> {
    const destressIds = this.getDestressCampaignIdsFromEnv();
    if (destressIds) {
      return this.getDashboardDataDestress(datePreset, destressIds);
    }

    const account = await this.getAdAccount();
    await sleep(100);

    const trimmedId = campaignId?.trim();
    const nameFilter = this.getCampaignNameFilterFromEnv();
    let campaigns: Campaign[];
    let appliedNameFilter: string | undefined;

    if (nameFilter) {
      const all = await this.fetchAllCampaignsList();
      let matched = all.filter((c) =>
        c.name.toLowerCase().includes(nameFilter.toLowerCase())
      );
      if (trimmedId) {
        matched = matched.filter((c) => c.id === trimmedId);
        if (matched.length === 0) {
          throw new Error(
            `Campaign ${trimmedId} is not in the set matching "${nameFilter}" (or ID is wrong).`
          );
        }
      } else if (matched.length === 0) {
        throw new Error(
          `No campaigns found whose name contains "${nameFilter}". Check META_CAMPAIGN_NAME_FILTER and campaign names in Ads Manager.`
        );
      }
      campaigns = matched;
      appliedNameFilter = nameFilter;
    } else if (trimmedId) {
      const single = await this.fetchCampaignById(trimmedId);
      if (!single) {
        throw new Error(
          `Campaign not found or not accessible: ${trimmedId}. Check the ID and your token permissions.`
        );
      }
      campaigns = [single];
    } else {
      campaigns = await this.fetchAllCampaignsList();
    }
    await sleep(100);

    const campaignIds = campaigns.map((c) => c.id);

    // Only fetch campaign-level insights (the dashboard no longer needs
    // ad-set or ad-level data, and skipping them keeps Vercel Hobby under 10s).
    const campaignInsightsRows =
      campaignIds.length > 0
        ? await this.getAccountCampaignInsightsBatch(campaignIds, datePreset)
        : [];

    const campaignInsightsById = new Map<string, MetaInsights>();
    for (const row of campaignInsightsRows) {
      if (row.campaign_id) {
        campaignInsightsById.set(row.campaign_id, row);
      }
    }

    const dashboardCampaigns: DashboardCampaign[] = campaigns.map((campaign) => {
      const ci = campaignInsightsById.get(campaign.id) ?? null;
      const primary = ci
        ? this.getPrimaryResult(ci.actions, ci.cost_per_action_type)
        : { count: 0, type: null as ResultType | null, costPer: 0 };

      const totalImpressions = parseInt(ci?.impressions || '0', 10);
      const totalReach = parseInt(ci?.reach || '0', 10);
      const totalClicks = parseInt(ci?.clicks || '0', 10);
      const totalSpend = parseFloat(ci?.spend || '0');
      const totalLeads = ci ? this.getLeadCount(ci) : 0;
      const totalResults = primary.count;
      const costPerResult = totalResults > 0 ? totalSpend / totalResults : 0;

      const hasDailyBudget = !!campaign.daily_budget;
      const hasLifetimeBudget =
        !!campaign.lifetime_budget && parseFloat(campaign.lifetime_budget || '0') > 0;
      const budget = hasDailyBudget
        ? parseFloat(campaign.daily_budget || '0') / 100
        : parseFloat(campaign.lifetime_budget || '0') / 100;
      const budgetType: 'daily' | 'lifetime' | null = hasDailyBudget
        ? 'daily'
        : hasLifetimeBudget
        ? 'lifetime'
        : null;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.effective_status,
        objective: campaign.objective,
        totalLeads,
        totalResults,
        resultType: primary.type,
        costPerResult,
        totalImpressions,
        totalReach,
        totalClicks,
        totalSpend,
        avgCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
        avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        budget,
        budgetRemaining: parseFloat(campaign.budget_remaining || '0') / 100,
        budgetType,
        currency: account.currency || 'INR',
        engagement: this.extractEngagement(ci),
        adsets: [],
      };
    });

    // --- Leads breakdown: fetch ad-set insights for the "Leads" campaign ---
    const leadsCampaign = campaigns.find((c) =>
      c.name.toLowerCase().includes('leads')
    );
    let leadsBreakdown = { total: 0, vote: 0, shareYourKissa: 0, guessTheColony: 0 };

    if (leadsCampaign) {
      try {
        await sleep(200);
        // Single call: adset-level insights with adset_name included — avoids
        // a separate adsets list fetch and halves the API calls.
        const adsetRows = await this.fetchAccountInsightsBatched({
          level: 'adset',
          fields: [...INSIGHT_FIELDS_BASE, 'campaign_id', 'adset_id', 'adset_name'].join(','),
          date_preset: datePreset,
          filtering: JSON.stringify([
            { field: 'campaign.id', operator: 'IN', value: [leadsCampaign.id] },
          ]),
        });

        for (const row of adsetRows) {
          const leads = this.getLeadCount(row);
          if (leads === 0) continue;

          const n = ((row as any).adset_name || '').toLowerCase();
          if (n.includes('voted') || n.includes('vote')) {
            leadsBreakdown.vote += leads;
          } else if (n.includes('guess')) {
            leadsBreakdown.guessTheColony += leads;
          } else {
            leadsBreakdown.shareYourKissa += leads;
          }
          leadsBreakdown.total += leads;
        }
      } catch (e) {
        console.warn('Ad-set breakdown failed, using campaign total:', e);
        leadsBreakdown.total =
          dashboardCampaigns.find((c) => c.id === leadsCampaign.id)?.totalLeads ?? 0;
      }
    }

    // --- DM conversations from WhatsApp & Instagram campaigns ---
    const getMessagingCount = (campaignId: string): number => {
      const ci = campaignInsightsById.get(campaignId);
      return this.getMessagingCountFromInsights(ci ?? null);
    };

    const whatsappRaw = campaigns.find((c) => c.name.toLowerCase().includes('whatsapp'));
    const igRaw = campaigns.find((c) => c.name.toLowerCase().includes('ig dm'));
    const dmConversations = {
      whatsapp: whatsappRaw ? getMessagingCount(whatsappRaw.id) : 0,
      instagram: igRaw ? getMessagingCount(igRaw.id) : 0,
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
      campaigns: dashboardCampaigns,
      leadsBreakdown,
      dmConversations,
      lastUpdated: new Date().toISOString(),
      ...(appliedNameFilter
        ? { filter: { campaignNameContains: appliedNameFilter } }
        : {}),
    };
  }

  // Exchange short-lived token for long-lived token
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

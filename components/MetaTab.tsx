'use client';

import { useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { formatCurrency, formatNumber, formatNumberIN, formatPercent } from '@/lib/formatters';
import { Section, KPICard, DataToolbar, ErrorBanner, LoadingGrid } from '@/components/dashboard-ui';
import { META_BUDGET_INR, computeBudget } from '@/lib/budget-config';

export function MetaTab() {
  const { data, cache, loading, error, refresh, lastRefreshed } = useDashboardData({
    datePreset: 'maximum',
    autoRefresh: false,
  });

  const campaign = data?.campaign ?? null;
  const currency = data?.account?.currency || 'INR';

  const totals = useMemo(() => {
    const impressions = campaign?.impressions ?? 0;
    const linkClicks = campaign?.linkClicks ?? 0;
    return {
      spend: campaign?.spend ?? 0,
      cpm: campaign?.cpm ?? 0,
      frequency: campaign?.frequency ?? 0,
      leads: campaign?.leads ?? 0,
      costPerLead: campaign?.costPerLead ?? 0,
      reach: campaign?.reach ?? 0,
      impressions,
      linkClicks,
      linkCtr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
    };
  }, [campaign]);

  const engagementRows = useMemo(() => {
    const e = campaign?.engagement;
    return [
      { category: 'Page Engagement', value: e?.pageEngagement ?? 0 },
      { category: 'Post Reactions', value: e?.postReactions ?? 0 },
      { category: 'Post Comments', value: e?.postComments ?? 0 },
      { category: 'Post Saves', value: e?.postSaves ?? 0 },
      { category: 'Post Shares', value: e?.postShares ?? 0 },
      { category: 'Link Clicks', value: e?.linkClicks ?? 0 },
    ];
  }, [campaign]);

  const budget = useMemo(() => computeBudget(totals.spend, META_BUDGET_INR), [totals.spend]);

  return (
    <div className="space-y-8">
      <DataToolbar
        label={data?.account?.name || (loading ? 'Loading…' : null)}
        cacheHit={cache?.hit}
        lastRefreshed={lastRefreshed}
        loading={loading}
        onRefresh={() => refresh(true)}
        refreshTitle="Pull fresh data from Meta (bypasses cache)"
      />

      {error && <ErrorBanner message={error} onRetry={() => refresh(true)} />}

      <Section title="Budget">
        <KPICard label="Total Budget" value={formatCurrency(budget.budget, currency)} accent="#6366f1" />
        <KPICard label="Spend Used" value={formatCurrency(budget.billedSpend, currency)} accent="#f59e0b" />
        <KPICard
          label="Balance"
          value={formatCurrency(budget.balance, currency)}
          accent={budget.balance < 0 ? '#ef4444' : '#10b981'}
          valueColor={budget.balance < 0 ? '#ef4444' : '#111827'}
        />
      </Section>

      <Section title="Spend Overview">
        <KPICard label="Amount Spent" value={formatCurrency(totals.spend, currency)} accent="#3b82f6" />
        <KPICard label="CPM" value={formatCurrency(totals.cpm, currency)} accent="#0891b2" />
        <KPICard label="Frequency" value={totals.frequency.toFixed(2)} accent="#d97706" />
      </Section>

      <Section title="Performance">
        <KPICard label="Leads" value={formatNumber(totals.leads)} accent="#10b981" />
        <KPICard label="Cost per Lead" value={formatCurrency(totals.costPerLead, currency)} accent="#0ea5e9" />
        <KPICard label="Reach" value={formatNumber(totals.reach)} accent="#7c3aed" />
        <KPICard label="Impressions" value={formatNumber(totals.impressions)} accent="#8b5cf6" />
        <KPICard label="Link clicks" value={formatNumberIN(totals.linkClicks)} accent="#ec4899" />
        <KPICard label="Link CTR" value={formatPercent(totals.linkCtr)} accent="#0891b2" />
      </Section>

      <div>
        <h2 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: '#9ca3af' }}>
          Engagement Breakdown
        </h2>
        <div className="rounded-xl border overflow-hidden shadow-sm w-full" style={{ borderColor: '#e5e7eb', background: '#fff' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: '#9ca3af' }}>
                  Category
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: '#9ca3af' }}>
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {engagementRows.map((row) => (
                <tr key={row.category} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td className="px-4 py-2.5 text-xs" style={{ color: '#374151' }}>
                    {row.category}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right text-xs font-semibold"
                    style={{ color: '#111827', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {formatNumber(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading && !data && <LoadingGrid />}
    </div>
  );
}

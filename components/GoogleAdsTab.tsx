'use client';

import { useGoogleAdsData } from '@/hooks/useGoogleAdsData';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/formatters';
import { Section, KPICard, DataToolbar, ErrorBanner, LoadingGrid } from '@/components/dashboard-ui';
import { GOOGLE_BUDGET_INR, computeBudget } from '@/lib/budget-config';

export function GoogleAdsTab() {
  const { data, cache, loading, error, refresh, lastRefreshed } = useGoogleAdsData();

  const summary = data?.summary ?? null;
  const currency = data?.currency || 'INR';

  const rawSpend = summary?.cost ?? 0;
  // No multiplier for Google — Cost + Spend Used show the raw sheet value.
  const budget = computeBudget(rawSpend, GOOGLE_BUDGET_INR, 1);

  return (
    <div className="space-y-8">
      <DataToolbar
        label={summary?.accountName || (loading ? 'Loading…' : null)}
        cacheHit={cache?.hit}
        lastRefreshed={lastRefreshed}
        loading={loading}
        onRefresh={() => refresh(true)}
        refreshTitle="Re-read the Google Ads sheet (bypasses cache)"
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
        <KPICard label="Cost" value={formatCurrency(budget.billedSpend, currency)} accent="#3b82f6" />
        <KPICard label="Avg CPC" value={formatCurrency(summary?.avgCpc ?? 0, currency)} accent="#0891b2" />
        <KPICard label="Conversions" value={formatNumber(summary?.conversions ?? 0)} accent="#10b981" />
      </Section>

      <Section title="Performance">
        <KPICard label="Impressions" value={formatNumber(summary?.impressions ?? 0)} accent="#8b5cf6" />
        <KPICard label="Clicks" value={formatNumber(summary?.clicks ?? 0)} accent="#ec4899" />
        <KPICard label="CTR" value={formatPercent(summary?.ctr ?? 0)} accent="#0891b2" />
      </Section>

      {loading && !data && <LoadingGrid />}
    </div>
  );
}

'use client';

import { useGoogleAdsData } from '@/hooks/useGoogleAdsData';
import { formatCurrency, formatNumber, formatPercent, getStatusDot, getStatusColor } from '@/lib/formatters';
import { Section, KPICard, DataToolbar, ErrorBanner, LoadingGrid } from '@/components/dashboard-ui';
import { GOOGLE_BUDGET_INR, computeBudget } from '@/lib/budget-config';

export function GoogleAdsTab() {
  const { data, cache, loading, error, refresh, lastRefreshed } = useGoogleAdsData();

  const summary = data?.summary ?? null;
  const campaigns = data?.campaigns ?? [];
  const currency = data?.currency || 'INR';

  const rawSpend = summary?.cost ?? 0;
  const budget = computeBudget(rawSpend, GOOGLE_BUDGET_INR);

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
        <KPICard label="Cost" value={formatCurrency(summary?.cost ?? 0, currency)} accent="#3b82f6" />
        <KPICard label="Avg CPC" value={formatCurrency(summary?.avgCpc ?? 0, currency)} accent="#0891b2" />
        <KPICard label="Conversions" value={formatNumber(summary?.conversions ?? 0)} accent="#10b981" />
      </Section>

      <Section title="Performance">
        <KPICard label="Impressions" value={formatNumber(summary?.impressions ?? 0)} accent="#8b5cf6" />
        <KPICard label="Clicks" value={formatNumber(summary?.clicks ?? 0)} accent="#ec4899" />
        <KPICard label="CTR" value={formatPercent(summary?.ctr ?? 0)} accent="#0891b2" />
      </Section>

      <div>
        <h2 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: '#9ca3af' }}>
          Campaigns
        </h2>
        <div className="rounded-xl border overflow-x-auto shadow-sm w-full" style={{ borderColor: '#e5e7eb', background: '#fff' }}>
          <table className="w-full text-sm" style={{ minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <Th align="left">Campaign</Th>
                <Th align="left">Status</Th>
                <Th align="right">Impr.</Th>
                <Th align="right">Clicks</Th>
                <Th align="right">CTR</Th>
                <Th align="right">Avg CPC</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Conv.</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs" style={{ color: '#9ca3af' }}>
                    No campaigns found in the sheet.
                  </td>
                </tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.campaignId || c.campaignName} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#111827' }}>
                    {c.campaignName}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(c.status)}`} />
                      <span className={getStatusColor(c.status)}>{c.status || '—'}</span>
                    </span>
                  </td>
                  <Td>{formatNumber(c.impressions)}</Td>
                  <Td>{formatNumber(c.clicks)}</Td>
                  <Td>{formatPercent(c.ctr)}</Td>
                  <Td>{formatCurrency(c.avgCpc, currency)}</Td>
                  <Td>{formatCurrency(c.cost, currency)}</Td>
                  <Td>{formatNumber(c.conversions)}</Td>
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

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      className={`px-4 py-2.5 ${align === 'left' ? 'text-left' : 'text-right'} text-xs font-medium whitespace-nowrap`}
      style={{ color: '#9ca3af' }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="px-4 py-2.5 text-right text-xs font-semibold whitespace-nowrap"
      style={{ color: '#111827', fontFamily: "'JetBrains Mono', monospace" }}
    >
      {children}
    </td>
  );
}

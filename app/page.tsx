'use client';

import { useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  DASHBOARD_BRAND_LETTER,
  DASHBOARD_TITLE,
  SPEND_MULTIPLIER,
  TEST_TAKERS_COUNT,
  TOTAL_BUDGET,
} from '@/lib/dashboard-config';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  timeAgo,
} from '@/lib/formatters';

const REFRESH_INTERVAL_SEC = Number(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? 300);

export default function Dashboard() {
  const { data, displayOverrides, sheetConnection, loading, error, refresh, lastRefreshed } =
    useDashboardData({
      datePreset: 'maximum',
      refreshInterval: REFRESH_INTERVAL_SEC,
      autoRefresh: true,
    });

  const campaigns = data?.campaigns ?? [];

  /**
   * Meta-derived totals. “Link clicks” = `link_click` actions (`engagement.linkClicks`).
   * Amount spent / balance / link clicks on the page can be overridden via manual values (see API).
   */
  const totals = useMemo(() => {
    const spend = campaigns.reduce((s, c) => s + c.totalSpend, 0);
    const impressions = campaigns.reduce((s, c) => s + c.totalImpressions, 0);
    const reach = campaigns.reduce((s, c) => s + c.totalReach, 0);
    const linkClicks = campaigns.reduce((s, c) => s + c.engagement.linkClicks, 0);

    const pageEngagement = campaigns.reduce((s, c) => s + c.engagement.pageEngagement, 0);
    const postReactions = campaigns.reduce((s, c) => s + c.engagement.postReactions, 0);
    const postComments = campaigns.reduce((s, c) => s + c.engagement.postComments, 0);
    const postSaves = campaigns.reduce((s, c) => s + c.engagement.postSaves, 0);
    const postShares = campaigns.reduce((s, c) => s + c.engagement.postShares, 0);

    const displaySpend = spend * SPEND_MULTIPLIER;

    return {
      spend: displaySpend,
      balanceLeft: Math.max(0, TOTAL_BUDGET - displaySpend),
      reach,
      impressions,
      linkClicks,
      linkCtr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
      pageEngagement,
      postReactions,
      postComments,
      postSaves,
      postShares,
    };
  }, [campaigns]);

  const display = useMemo(() => {
    const amountSpent = displayOverrides.amountSpent ?? totals.spend;
    const balanceLeft = displayOverrides.balanceLeft ?? totals.balanceLeft;
    const linkClicks = displayOverrides.linkClicks ?? totals.linkClicks;
    const linkCtr = totals.impressions > 0 ? (linkClicks / totals.impressions) * 100 : 0;
    return { amountSpent, balanceLeft, linkClicks, linkCtr };
  }, [displayOverrides, totals]);

  const currency = data?.account?.currency || 'INR';

  const engagementRows = [
    { category: 'Page Engagement', value: totals.pageEngagement },
    { category: 'Post Reactions', value: totals.postReactions },
    { category: 'Post Comments', value: totals.postComments },
    { category: 'Post Saves', value: totals.postSaves },
    { category: 'Post Shares', value: totals.postShares },
    { category: 'Link Clicks', value: display.linkClicks },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <header
        className="sticky top-0 z-50 border-b"
        style={{ borderColor: '#e5e7eb', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)' }}
      >
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: '#3b82f6', color: '#fff' }}
            >
              {DASHBOARD_BRAND_LETTER}
            </div>
            <div>
              <h1 className="text-base font-semibold" style={{ color: '#111827' }}>
                {DASHBOARD_TITLE}
              </h1>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                {data?.account?.name || (loading ? 'Loading…' : '—')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {lastRefreshed && (
              <div className="flex items-center gap-2 text-xs" style={{ color: '#9ca3af' }}>
                <span className="animate-pulse-dot w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Updated {timeAgo(lastRefreshed)}</span>
              </div>
            )}
            <button
              onClick={() => refresh()}
              disabled={loading}
              className="p-2 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: '#e5e7eb' }}
              title="Refresh"
              type="button"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                style={{ color: '#6b7280' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-8">
        {sheetConnection.status === 'error' && (
          <div
            className="rounded-xl border p-3 text-sm"
            style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}
            role="status"
          >
            <p className="font-medium">Google Sheet not applied</p>
            <p className="text-xs mt-1 opacity-90">
              The app could not read CSV from your sheet ({sheetConnection.error}). Use{' '}
              <strong>Share → Anyone with the link → Viewer</strong>, confirm{' '}
              <code className="text-[11px]">GOOGLE_SHEET_ID</code> or{' '}
              <code className="text-[11px]">GOOGLE_SHEET_CSV_URL</code> in Vercel, then redeploy.
              Until then, spend / balance / link clicks use Meta (or env overrides).
            </p>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl border p-4 flex items-center gap-3"
            style={{ borderColor: '#fecaca', background: '#fef2f2' }}
          >
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700">API Error</p>
              <p className="text-xs text-red-500 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => refresh()}
              type="button"
              className="ml-auto text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
            >
              Retry
            </button>
          </div>
        )}

        <Section title="Spend Overview">
          <KPICard label="Amount Spent" value={formatCurrency(display.amountSpent, currency)} accent="#3b82f6" />
          <KPICard label="Balance Left" value={formatCurrency(display.balanceLeft, currency)} accent="#d97706" />
        </Section>

        <Section title="Performance">
          <KPICard label="Test takers" value={formatNumber(TEST_TAKERS_COUNT)} accent="#10b981" />
          <KPICard label="Reach" value={formatNumber(totals.reach)} accent="#7c3aed" />
          <KPICard label="Impressions" value={formatNumber(totals.impressions)} accent="#8b5cf6" />
          <KPICard label="Link clicks" value={formatNumber(display.linkClicks)} accent="#ec4899" />
          <KPICard label="Link CTR" value={formatPercent(display.linkCtr)} accent="#0891b2" />
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

        {loading && !data && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-5" style={{ borderColor: '#e5e7eb', background: '#fff' }}>
                <div className="h-3 w-20 rounded animate-pulse mb-3" style={{ background: '#f3f4f6' }} />
                <div className="h-7 w-28 rounded animate-pulse" style={{ background: '#f3f4f6' }} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: '#9ca3af' }}>
        {title}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 stagger-children">{children}</div>
    </div>
  );
}

function KPICard({ label, value, accent, subtitle }: { label: string; value: string; accent: string; subtitle?: string }) {
  return (
    <div
      className="rounded-xl border p-5 relative overflow-hidden group hover:shadow-md transition-all"
      style={{ borderColor: '#e5e7eb', background: '#fff' }}
    >
      <div
        className="absolute -top-8 -right-8 w-16 h-16 rounded-full opacity-5 blur-xl group-hover:opacity-10 transition-opacity"
        style={{ background: accent }}
      />
      <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: '#9ca3af' }}>
        {label}
      </p>
      <p className="text-lg font-bold" style={{ color: '#111827', fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>
          {subtitle}
        </p>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: accent, opacity: 0.3 }} />
    </div>
  );
}

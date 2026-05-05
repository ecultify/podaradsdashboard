'use client';

import { useMemo, useState } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useSpendsTable } from '@/hooks/useSpendsTable';
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
  formatNumberIN,
  formatPercent,
  timeAgo,
} from '@/lib/formatters';

type TabKey = 'overview' | 'spends';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const { data, displayOverrides, sheetConnection, loading, error, refresh, lastRefreshed } =
    useDashboardData({
      datePreset: 'maximum',
      autoRefresh: false,
    });

  const spends = useSpendsTable(activeTab === 'spends');

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
    const googleAds = displayOverrides.googleAds ?? 0;
    const combinedImpressions = totals.impressions + googleAds;
    const linkCtr = combinedImpressions > 0 ? (linkClicks / combinedImpressions) * 100 : 0;
    const testTakers = displayOverrides.testTakers ?? TEST_TAKERS_COUNT;
    const reach = displayOverrides.reach ?? totals.reach;
    return { amountSpent, balanceLeft, linkClicks, linkCtr, testTakers, googleAds, combinedImpressions, reach };
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
              title="Reload dashboard (Meta API + Google Sheet)"
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
        <div className="flex items-center gap-1 border-b" style={{ borderColor: '#e5e7eb' }}>
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={activeTab === 'spends'} onClick={() => setActiveTab('spends')}>
            TOI D-stress spends
          </TabButton>
        </div>

        {activeTab === 'spends' && (
          <SpendsTab
            data={spends.data}
            loading={spends.loading}
            error={spends.error}
            onRefresh={spends.refresh}
          />
        )}

        {activeTab === 'overview' && <>
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
            className="rounded-xl border p-4 flex items-start gap-3"
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
              <p className="text-xs text-red-500 mt-0.5 whitespace-pre-wrap break-words">{error}</p>
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
          <KPICard label="Test takers" value={formatNumber(display.testTakers)} accent="#10b981" />
          <KPICard label="Reach" value={formatNumber(display.reach)} accent="#7c3aed" />
          <KPICard label="Impressions" value={formatNumber(display.combinedImpressions)} accent="#8b5cf6" />
          <KPICard label="Google Ads Impressions" value={formatNumber(display.googleAds)} accent="#f59e0b" />
          <KPICard label="Link clicks" value={formatNumberIN(display.linkClicks)} accent="#ec4899" />
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
        </>}
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative px-4 py-2.5 text-sm font-medium transition-colors"
      style={{
        color: active ? '#111827' : '#6b7280',
      }}
    >
      {children}
      {active && (
        <span
          className="absolute left-0 right-0 -bottom-px h-0.5"
          style={{ background: '#3b82f6' }}
        />
      )}
    </button>
  );
}

/** Columns whose values should render right-aligned as numbers / currency. */
const NUMERIC_HEADER_PATTERNS = [
  /amount/i,
  /spent/i,
  /spend/i,
  /impressions?/i,
  /reach/i,
  /engagement/i,
  /leads?/i,
  /clicks?/i,
  /ctr/i,
  /cpl/i,
  /cpm/i,
  /cpc/i,
  /cost/i,
  /frequency/i,
  /budget/i,
];

const CURRENCY_HEADER_PATTERNS = [/amount/i, /spent/i, /spend/i, /cpl/i, /cpm/i, /cpc/i, /cost/i, /budget/i];
const PERCENT_HEADER_PATTERNS = [/ctr/i, /rate/i];

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim());
}

function headerMatches(header: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(header));
}

function formatCellValue(header: string, value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (isUrl(v)) return v;
  const numeric = Number(v.replace(/,/g, '').replace(/[₹$]/g, '').replace(/%/g, ''));
  if (!Number.isFinite(numeric)) return v;

  if (headerMatches(header, PERCENT_HEADER_PATTERNS)) {
    return `${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
  }
  if (headerMatches(header, CURRENCY_HEADER_PATTERNS)) {
    return `₹${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  if (headerMatches(header, NUMERIC_HEADER_PATTERNS)) {
    return numeric.toLocaleString('en-IN');
  }
  return v;
}

function SpendsTab({
  data,
  loading,
  error,
  onRefresh,
}: {
  data: { headers: string[]; rows: string[][] } | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  if (loading && !data) {
    return (
      <div
        className="rounded-xl border p-8 text-sm"
        style={{ borderColor: '#e5e7eb', background: '#fff', color: '#6b7280' }}
      >
        Loading…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="rounded-xl border p-4 flex items-start gap-3"
        style={{ borderColor: '#fecaca', background: '#fef2f2' }}
      >
        <div className="flex-1">
          <p className="text-sm font-medium text-red-700">Could not load spends table</p>
          <p className="text-xs text-red-500 mt-0.5 whitespace-pre-wrap break-words">{error}</p>
          <p className="text-xs text-red-500 mt-2">
            Check <code>GOOGLE_SPENDS_SHEET_ID</code> and <code>GOOGLE_SPENDS_SHEET_GID</code> in
            your env, and ensure the sheet is shared as <strong>Anyone with the link → Viewer</strong>.
          </p>
        </div>
        <button
          onClick={() => onRefresh()}
          type="button"
          className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div
        className="rounded-xl border p-8 text-sm text-center"
        style={{ borderColor: '#e5e7eb', background: '#fff', color: '#6b7280' }}
      >
        No spends data yet. Paste a table into the{' '}
        <strong>TOI_destress_spends</strong> tab of the value updater sheet.
      </div>
    );
  }

  const { headers, rows } = data;
  const numericColumnFlags = headers.map((h) => headerMatches(h, NUMERIC_HEADER_PATTERNS));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#9ca3af' }}>
          TOI D-stress spends
        </h2>
        <button
          type="button"
          onClick={() => onRefresh()}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md border transition hover:bg-gray-50 disabled:opacity-50"
          style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div
        className="rounded-xl border overflow-x-auto shadow-sm"
        style={{ borderColor: '#e5e7eb', background: '#fff' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              {headers.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap ${
                    numericColumnFlags[i] ? 'text-right' : 'text-left'
                  }`}
                  style={{ color: '#9ca3af' }}
                >
                  {h || ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const nonEmptyCount = row.filter((c) => c.trim().length > 0).length;
              // Render single-cell rows as a spanning section header.
              if (nonEmptyCount === 1) {
                const label = row.find((c) => c.trim().length > 0) ?? '';
                return (
                  <tr key={rIdx} style={{ background: '#f3f4f6' }}>
                    <td
                      colSpan={headers.length}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: '#374151' }}
                    >
                      {label}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={rIdx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {headers.map((h, cIdx) => {
                    const raw = row[cIdx] ?? '';
                    const numeric = numericColumnFlags[cIdx];
                    // Split cell on newlines so multi-value cells (e.g. multiple
                    // Creative URLs pasted into one cell) render as a stacked list.
                    const parts = raw
                      .split(/\r?\n/)
                      .map((p) => p.trim())
                      .filter((p) => p.length > 0);
                    const allLinks = parts.length > 0 && parts.every((p) => isUrl(p));
                    return (
                      <td
                        key={`${rIdx}-${cIdx}`}
                        className={`px-4 py-2.5 text-xs align-top ${
                          numeric ? 'text-right whitespace-nowrap' : 'text-left'
                        }`}
                        style={{
                          color: numeric ? '#111827' : '#374151',
                          fontFamily: numeric
                            ? "'JetBrains Mono', monospace"
                            : "'Outfit', system-ui, sans-serif",
                          fontWeight: numeric ? 600 : 400,
                        }}
                      >
                        {parts.length === 0 ? (
                          ''
                        ) : allLinks ? (
                          <div className="flex flex-col gap-0.5">
                            {parts.map((p, idx) => (
                              <a
                                key={idx}
                                href={p}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:no-underline"
                                style={{
                                  color: '#3b82f6',
                                  fontFamily: "'Outfit', system-ui, sans-serif",
                                  fontWeight: 400,
                                  fontSize: '0.75rem',
                                  letterSpacing: 'normal',
                                  fontStyle: 'normal',
                                  fontVariant: 'normal',
                                  textRendering: 'auto',
                                }}
                              >
                                View{parts.length > 1 ? ` ${idx + 1}` : ''}
                              </a>
                            ))}
                          </div>
                        ) : parts.length === 1 ? (
                          formatCellValue(h, parts[0])
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {parts.map((p, idx) => (
                              <span key={idx}>{formatCellValue(h, p)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

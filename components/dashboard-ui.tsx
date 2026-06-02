'use client';

import { timeAgo } from '@/lib/formatters';

/** Grid wrapper for a labelled group of KPI cards. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: '#9ca3af' }}>
        {title}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 stagger-children">{children}</div>
    </div>
  );
}

/** A single metric card with a colored accent. */
export function KPICard({
  label,
  value,
  accent,
  subtitle,
  valueColor = '#111827',
}: {
  label: string;
  value: string;
  accent: string;
  subtitle?: string;
  valueColor?: string;
}) {
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
      <p className="text-lg font-bold" style={{ color: valueColor, fontFamily: "'JetBrains Mono', monospace" }}>
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

/** Per-tab toolbar: optional left label + "cached/live · updated Xm ago" + a refresh button. */
export function DataToolbar({
  label,
  cacheHit,
  lastRefreshed,
  loading,
  onRefresh,
  refreshTitle,
}: {
  label?: string | null;
  cacheHit?: boolean;
  lastRefreshed: Date | null;
  loading: boolean;
  onRefresh: () => void;
  refreshTitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-medium truncate" style={{ color: '#374151' }}>
        {label || ' '}
      </p>
      <div className="flex items-center gap-4">
      {lastRefreshed && (
        <div className="flex items-center gap-2 text-xs" style={{ color: '#9ca3af' }}>
          <span className="animate-pulse-dot w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>
            {cacheHit ? 'Cached' : 'Live'} · updated {timeAgo(lastRefreshed)}
          </span>
        </div>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-2 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
        style={{ borderColor: '#e5e7eb' }}
        title={refreshTitle}
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
  );
}

/** Red error banner with a retry action. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
      <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      <div>
        <p className="text-sm font-medium text-red-700">Error</p>
        <p className="text-xs text-red-500 mt-0.5 whitespace-pre-wrap break-words">{message}</p>
      </div>
      <button
        onClick={onRetry}
        type="button"
        className="ml-auto text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
      >
        Retry
      </button>
    </div>
  );
}

/** Loading skeleton grid shown before the first payload arrives. */
export function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-5" style={{ borderColor: '#e5e7eb', background: '#fff' }}>
          <div className="h-3 w-20 rounded animate-pulse mb-3" style={{ background: '#f3f4f6' }} />
          <div className="h-7 w-28 rounded animate-pulse" style={{ background: '#f3f4f6' }} />
        </div>
      ))}
    </div>
  );
}

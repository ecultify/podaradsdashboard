'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardData } from '@/types/meta';
import type { DisplayOverridesPayload, SheetConnectionMeta } from '@/types/display';

interface UseDashboardDataOptions {
  datePreset?: string;
  campaignId?: string;
  refreshInterval?: number;
  /** When true, polls on an interval. Default false: load once, then only when `refresh()` runs (e.g. header button). */
  autoRefresh?: boolean;
}

interface UseDashboardDataReturn {
  data: DashboardData | null;
  displayOverrides: DisplayOverridesPayload;
  sheetConnection: SheetConnectionMeta;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastRefreshed: Date | null;
}

export function useDashboardData(options: UseDashboardDataOptions = {}): UseDashboardDataReturn {
  const {
    datePreset = 'maximum',
    campaignId,
    refreshInterval = 300,
    autoRefresh = false,
  } = options;

  const [data, setData] = useState<DashboardData | null>(null);
  const [displayOverrides, setDisplayOverrides] = useState<DisplayOverridesPayload>({});
  const [sheetConnection, setSheetConnection] = useState<SheetConnectionMeta>({ status: 'disabled' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ date_preset: datePreset });
      if (campaignId) params.set('campaign_id', campaignId);

      const response = await fetch(`/api/meta/dashboard?${params}`);
      const raw = await response.text();
      let result: {
        success?: boolean;
        error?: string;
        data?: DashboardData;
        displayOverrides?: DisplayOverridesPayload;
        sheetConnection?: SheetConnectionMeta;
      };
      try {
        result = JSON.parse(raw) as typeof result;
      } catch {
        throw new Error(
          response.status >= 500
            ? `Server error (${response.status}). Check logs and env vars.`
            : `Invalid response (${response.status})`
        );
      }
      if (!result.success) throw new Error(result.error || 'Dashboard request failed');
      if (!result.data) throw new Error('Dashboard returned no data');

      setData(result.data);
      setDisplayOverrides(result.displayOverrides ?? {});
      setSheetConnection(result.sheetConnection ?? { status: 'disabled' });
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [datePreset, campaignId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;
    const interval = setInterval(fetchData, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval, autoRefresh]);

  return { data, displayOverrides, sheetConnection, loading, error, refresh: fetchData, lastRefreshed };
}

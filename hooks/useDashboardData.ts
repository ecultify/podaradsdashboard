'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardData } from '@/types/meta';

interface CacheMeta {
  hit: boolean;
  ageSeconds: number;
  ttlSeconds: number;
}

interface UseDashboardDataOptions {
  datePreset?: string;
  /** Custom date window (YYYY-MM-DD). When both set, overrides datePreset. */
  since?: string;
  until?: string;
  refreshInterval?: number;
  /** When true, polls on an interval. Default false: load once, then on manual refresh. */
  autoRefresh?: boolean;
}

interface UseDashboardDataReturn {
  data: DashboardData | null;
  cache: CacheMeta | null;
  loading: boolean;
  error: string | null;
  /** Pass true to bypass the server cache and pull fresh data from Meta. */
  refresh: (force?: boolean) => Promise<void>;
  lastRefreshed: Date | null;
}

export function useDashboardData(
  options: UseDashboardDataOptions = {}
): UseDashboardDataReturn {
  const { datePreset = 'maximum', since, until, refreshInterval = 300, autoRefresh = false } = options;
  const useCustom = Boolean(since && until);

  const [data, setData] = useState<DashboardData | null>(null);
  const [cache, setCache] = useState<CacheMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(
    async (force = false) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (useCustom) {
          params.set('since', since as string);
          params.set('until', until as string);
        } else {
          params.set('date_preset', datePreset);
        }
        if (force) params.set('refresh', '1');

        const response = await fetch(`/api/meta/dashboard?${params}`);
        const raw = await response.text();
        let result: {
          success?: boolean;
          error?: string;
          data?: DashboardData;
          cache?: CacheMeta;
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
        setCache(result.cache ?? null);
        setLastRefreshed(new Date());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [datePreset, since, until, useCustom]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;
    const interval = setInterval(() => fetchData(), refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval, autoRefresh]);

  return { data, cache, loading, error, refresh: fetchData, lastRefreshed };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { GoogleAdsData } from '@/types/google-ads';

interface CacheMeta {
  hit: boolean;
  ageSeconds: number;
  ttlSeconds: number;
}

interface UseGoogleAdsDataReturn {
  data: GoogleAdsData | null;
  cache: CacheMeta | null;
  loading: boolean;
  error: string | null;
  /** Pass true to bypass the server cache and re-read the sheet. */
  refresh: (force?: boolean) => Promise<void>;
  lastRefreshed: Date | null;
}

export function useGoogleAdsData(): UseGoogleAdsDataReturn {
  const [data, setData] = useState<GoogleAdsData | null>(null);
  const [cache, setCache] = useState<CacheMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (force) params.set('refresh', '1');

      const response = await fetch(`/api/google-ads/dashboard?${params}`);
      const raw = await response.text();
      let result: {
        success?: boolean;
        error?: string;
        data?: GoogleAdsData;
        cache?: CacheMeta;
      };
      try {
        result = JSON.parse(raw) as typeof result;
      } catch {
        throw new Error(
          response.status >= 500
            ? `Server error (${response.status}). Check logs and the sheet sharing settings.`
            : `Invalid response (${response.status})`
        );
      }
      if (!result.success) throw new Error(result.error || 'Google Ads request failed');
      if (!result.data) throw new Error('Google Ads returned no data');

      setData(result.data);
      setCache(result.cache ?? null);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, cache, loading, error, refresh: fetchData, lastRefreshed };
}

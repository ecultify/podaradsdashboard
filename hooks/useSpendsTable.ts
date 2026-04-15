'use client';

import { useCallback, useEffect, useState } from 'react';

export type SpendsTable = {
  headers: string[];
  rows: string[][];
};

interface UseSpendsTableReturn {
  data: SpendsTable | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Module-scope cache: persists across tab switches for the lifetime of the page.
 * Page refresh clears it. `refresh()` bypasses the cache.
 */
type CacheEntry = { data: SpendsTable | null; error: string | null; ts: number };
let cache: CacheEntry | null = null;
let inflight: Promise<void> | null = null;
const subscribers = new Set<(c: CacheEntry) => void>();

async function loadOnce(force = false): Promise<void> {
  if (!force && cache) return;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/spends-table', { cache: 'no-store' });
      const json = (await res.json()) as
        | { success: true; data: SpendsTable }
        | { success: false; error: string };
      const entry: CacheEntry = json.success
        ? { data: json.data, error: null, ts: Date.now() }
        : { data: null, error: json.error || 'Failed to load spends table', ts: Date.now() };
      cache = entry;
      subscribers.forEach((fn) => fn(entry));
    } catch (e) {
      const entry: CacheEntry = {
        data: null,
        error: e instanceof Error ? e.message : 'Failed to load spends table',
        ts: Date.now(),
      };
      cache = entry;
      subscribers.forEach((fn) => fn(entry));
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function useSpendsTable(enabled: boolean = true): UseSpendsTableReturn {
  const [data, setData] = useState<SpendsTable | null>(cache?.data ?? null);
  const [error, setError] = useState<string | null>(cache?.error ?? null);
  const [loading, setLoading] = useState<boolean>(!cache && enabled);

  useEffect(() => {
    const sub = (c: CacheEntry) => {
      setData(c.data);
      setError(c.error);
      setLoading(false);
    };
    subscribers.add(sub);
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (cache) {
      setData(cache.data);
      setError(cache.error);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadOnce();
  }, [enabled]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadOnce(true);
  }, []);

  return { data, loading, error, refresh };
}

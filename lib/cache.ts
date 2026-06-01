// lib/cache.ts — tiny in-memory TTL cache.
//
// Purpose: the dashboard pulls everything straight from Meta. Without a cache,
// every page reload would fan out ~7 Graph API calls and quickly trip Meta's
// rate limits. We cache the computed payload per cache-key for a short TTL so
// repeated reloads inside the window are served from memory (zero API calls).
//
// The store is attached to globalThis so it survives Next.js dev HMR reloads and
// is reused across requests on a warm serverless / Fluid Compute instance.

interface CacheEntry<T> {
  data: T;
  storedAt: number;
  expiresAt: number;
}

type CacheStore = Map<string, CacheEntry<unknown>>;

const globalForCache = globalThis as unknown as { __podarCache?: CacheStore };

const store: CacheStore = globalForCache.__podarCache ?? new Map();
if (!globalForCache.__podarCache) {
  globalForCache.__podarCache = store;
}

export interface CacheHit<T> {
  data: T;
  ageSeconds: number;
}

export function getCached<T>(key: string): CacheHit<T> | null {
  const entry = store.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now >= entry.expiresAt) {
    store.delete(key);
    return null;
  }

  return {
    data: entry.data as T,
    ageSeconds: Math.floor((now - entry.storedAt) / 1000),
  };
}

export function setCached<T>(key: string, data: T, ttlSeconds: number): void {
  const now = Date.now();
  store.set(key, {
    data,
    storedAt: now,
    expiresAt: now + ttlSeconds * 1000,
  });
}

export function clearCache(key?: string): void {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}

/** Reads META_CACHE_TTL_SECONDS (default 300s). */
export function getCacheTtlSeconds(): number {
  const raw = Number(process.env.META_CACHE_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

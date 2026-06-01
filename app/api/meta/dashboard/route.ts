import { NextRequest, NextResponse } from 'next/server';
import MetaApiClient from '@/lib/meta-api';
import { ApiResponse, DashboardData } from '@/types/meta';
import { getCached, setCached, clearCache, getCacheTtlSeconds } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const datePreset = searchParams.get('date_preset') || 'maximum';
  // `?refresh=1` bypasses (and refreshes) the cache — wired to the header button.
  const forceRefresh = searchParams.get('refresh') === '1';

  const cacheKey = `dashboard:${datePreset}`;
  const ttl = getCacheTtlSeconds();

  try {
    if (!forceRefresh) {
      const cached = getCached<DashboardData>(cacheKey);
      if (cached) {
        const response: ApiResponse<DashboardData> = {
          success: true,
          data: cached.data,
          cache: { hit: true, ageSeconds: cached.ageSeconds, ttlSeconds: ttl },
        };
        return NextResponse.json(response);
      }
    } else {
      clearCache(cacheKey);
    }

    const client = new MetaApiClient();
    const data = await client.getDashboardData(datePreset);
    setCached(cacheKey, data, ttl);

    const response: ApiResponse<DashboardData> = {
      success: true,
      data,
      cache: { hit: false, ageSeconds: 0, ttlSeconds: ttl },
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('Dashboard API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch dashboard data';

    // Serve stale cache on error so a rate-limit blip doesn't blank the dashboard.
    const stale = getCached<DashboardData>(cacheKey);
    if (stale) {
      const response: ApiResponse<DashboardData> = {
        success: true,
        data: stale.data,
        cache: { hit: true, ageSeconds: stale.ageSeconds, ttlSeconds: ttl },
      };
      return NextResponse.json(response);
    }

    const response: ApiResponse<null> = { success: false, error: message };
    return NextResponse.json(response, { status: 500 });
  }
}

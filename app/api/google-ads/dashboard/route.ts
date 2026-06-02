import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAdsData } from '@/lib/google-sheet';
import { GoogleAdsData } from '@/types/google-ads';
import { ApiResponse } from '@/types/meta';
import { getCached, setCached, clearCache, getCacheTtlSeconds } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  // `?refresh=1` bypasses (and refreshes) the cache — wired to the header button.
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  const cacheKey = 'google-ads:dashboard';
  const ttl = getCacheTtlSeconds();

  try {
    if (!forceRefresh) {
      const cached = getCached<GoogleAdsData>(cacheKey);
      if (cached) {
        const response: ApiResponse<GoogleAdsData> = {
          success: true,
          data: cached.data,
          cache: { hit: true, ageSeconds: cached.ageSeconds, ttlSeconds: ttl },
        };
        return NextResponse.json(response);
      }
    } else {
      clearCache(cacheKey);
    }

    const data = await getGoogleAdsData();
    setCached(cacheKey, data, ttl);

    const response: ApiResponse<GoogleAdsData> = {
      success: true,
      data,
      cache: { hit: false, ageSeconds: 0, ttlSeconds: ttl },
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('Google Ads dashboard API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch Google Ads data';

    // Serve stale cache on error so a transient sheet blip doesn't blank the tab.
    const stale = getCached<GoogleAdsData>(cacheKey);
    if (stale) {
      const response: ApiResponse<GoogleAdsData> = {
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

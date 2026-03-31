import { NextRequest, NextResponse } from 'next/server';
import MetaApiClient from '@/lib/meta-api';
import { ApiResponse, DashboardData } from '@/types/meta';

export const dynamic = 'force-dynamic';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const datePreset = searchParams.get('date_preset') || 'maximum';
    const campaignId = searchParams.get('campaign_id')?.trim() || undefined;

    const client = new MetaApiClient();
    const data = await client.getDashboardData(datePreset, campaignId);

    const response: ApiResponse<DashboardData> = {
      success: true,
      data,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('Dashboard API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch dashboard data';

    const response: ApiResponse<null> = {
      success: false,
      error: message,
    };

    return NextResponse.json(response, { status: 500 });
  }
}

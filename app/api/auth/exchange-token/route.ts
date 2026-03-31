import { NextRequest, NextResponse } from 'next/server';
import MetaApiClient from '@/lib/meta-api';

export async function POST(request: NextRequest) {
  try {
    const { shortLivedToken } = await request.json();

    if (!shortLivedToken) {
      return NextResponse.json({ success: false, error: 'shortLivedToken is required' }, { status: 400 });
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(
        { success: false, error: 'META_APP_ID and META_APP_SECRET must be set' },
        { status: 500 }
      );
    }

    const result = await MetaApiClient.exchangeToken(shortLivedToken, appId, appSecret);

    return NextResponse.json({
      success: true,
      data: {
        accessToken: result.access_token,
        tokenType: result.token_type,
        expiresIn: result.expires_in,
        expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

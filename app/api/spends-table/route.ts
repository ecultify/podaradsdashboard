import { NextResponse } from 'next/server';
import { fetchSpendsSheet } from '@/lib/spends-sheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const { table, error } = await fetchSpendsSheet();
    if (!table) {
      return NextResponse.json(
        { success: false, error: error ?? 'Could not load spends sheet' },
        { status: 200 }
      );
    }
    return NextResponse.json({ success: true, data: table }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

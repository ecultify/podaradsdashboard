import fs from 'fs';
import path from 'path';
import type { DashboardData } from '@/types/meta';
import type { DisplayOverridesPayload, SheetConnectionMeta } from '@/types/display';
import { buildCandidateSheetUrls, fetchKpiSheet, type SheetKpiRow } from '@/lib/sheet-csv';

function parseEnvNumber(key: string): number | null {
  const v = process.env[key]?.trim();
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type FileShape = {
  totalAmount?: number | null;
  amountSpent?: number | null;
  balanceLeft?: number | null;
  linkClicks?: number | null;
};

function readPublicManualFile(): Partial<FileShape> {
  try {
    const fp = path.join(process.cwd(), 'public', 'manual-values.json');
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw) as FileShape;
  } catch {
    return {};
  }
}

function numOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Raw overrides before Meta is applied (for balance = total − spent). */
export type RawDisplayOverrides = {
  amountSpent?: number;
  linkClicks?: number;
  totalAmount?: number;
  /** Explicit balance only when MANUAL_BALANCE_LEFT or file.balanceLeft set */
  balanceExplicit?: number;
  testTakers?: number;
  googleAds?: number;
  reach?: number;
};

function sheetRowHasValues(row: SheetKpiRow | null): boolean {
  if (!row) return false;
  return (
    row.totalAmount !== undefined ||
    row.amountSpent !== undefined ||
    row.linkClicks !== undefined ||
    row.testTakers !== undefined ||
    row.googleAds !== undefined ||
    row.reach !== undefined
  );
}

/**
 * Merge env → Google Sheet CSV → public/manual-values.json.
 * Priority per field: MANUAL_* env wins, then sheet, then file.
 */
export async function getRawDisplayOverrides(): Promise<{
  raw: RawDisplayOverrides;
  sheetMeta: SheetConnectionMeta;
}> {
  const file = readPublicManualFile();
  const sheetResult = await fetchKpiSheet();
  const sheet = sheetResult.row;

  const sheetConfigured = buildCandidateSheetUrls().length > 0;
  let sheetMeta: SheetConnectionMeta;
  if (!sheetConfigured) {
    sheetMeta = { status: 'disabled' };
  } else if (sheetRowHasValues(sheet)) {
    sheetMeta = { status: 'ok' };
  } else {
    sheetMeta = { status: 'error', error: sheetResult.error ?? 'sheet_unavailable' };
  }

  const totalAmount =
    parseEnvNumber('MANUAL_TOTAL_AMOUNT') ??
    numOrUndef(sheet?.totalAmount) ??
    numOrUndef(file.totalAmount);

  const amountSpent =
    parseEnvNumber('MANUAL_AMOUNT_SPENT') ??
    numOrUndef(sheet?.amountSpent) ??
    numOrUndef(file.amountSpent);

  const linkClicks =
    parseEnvNumber('MANUAL_LINK_CLICKS') ??
    numOrUndef(sheet?.linkClicks) ??
    numOrUndef(file.linkClicks);

  const balanceExplicit =
    parseEnvNumber('MANUAL_BALANCE_LEFT') ?? numOrUndef(file.balanceLeft);

  const testTakers =
    parseEnvNumber('MANUAL_TEST_TAKERS') ??
    numOrUndef(sheet?.testTakers);

  const googleAds =
    parseEnvNumber('MANUAL_GOOGLE_ADS') ??
    numOrUndef(sheet?.googleAds);

  const reach =
    parseEnvNumber('MANUAL_REACH') ??
    numOrUndef(sheet?.reach);

  const out: RawDisplayOverrides = {};
  if (totalAmount !== undefined) out.totalAmount = totalAmount;
  if (amountSpent !== undefined) out.amountSpent = amountSpent;
  if (linkClicks !== undefined) out.linkClicks = linkClicks;
  if (balanceExplicit !== undefined) out.balanceExplicit = balanceExplicit;
  if (testTakers !== undefined) out.testTakers = testTakers;
  if (googleAds !== undefined) out.googleAds = googleAds;
  if (reach !== undefined) out.reach = reach;

  return { raw: out, sheetMeta };
}

/**
 * Apply Meta totals for fallbacks and compute balance = totalAmount − effective spend
 * when `totalAmount` is set and `balanceExplicit` is not.
 */
export function finalizeDisplayOverrides(
  data: DashboardData,
  raw: RawDisplayOverrides
): DisplayOverridesPayload {
  const mult = Number(process.env.NEXT_PUBLIC_SPEND_MULTIPLIER ?? 1);
  const metaSpend = data.campaigns.reduce((s, c) => s + c.totalSpend, 0) * mult;

  const spentEffective = raw.amountSpent ?? metaSpend;

  const out: DisplayOverridesPayload = {};

  if (raw.amountSpent !== undefined) out.amountSpent = raw.amountSpent;
  if (raw.linkClicks !== undefined) out.linkClicks = raw.linkClicks;
  if (raw.totalAmount !== undefined) out.totalAmount = raw.totalAmount;
  if (raw.testTakers !== undefined) out.testTakers = raw.testTakers;
  if (raw.googleAds !== undefined) out.googleAds = raw.googleAds;
  if (raw.reach !== undefined) out.reach = raw.reach;

  if (raw.balanceExplicit !== undefined) {
    out.balanceLeft = raw.balanceExplicit;
  } else if (raw.totalAmount !== undefined) {
    out.balanceLeft = raw.totalAmount - spentEffective;
  }

  return out;
}

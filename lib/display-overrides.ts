import fs from 'fs';
import path from 'path';
import type { DisplayOverridesPayload } from '@/types/display';

function parseEnvNumber(key: string): number | null {
  const v = process.env[key]?.trim();
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type FileShape = {
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

/**
 * Manual KPI values for client-facing numbers not sourced from Meta.
 * Priority: `MANUAL_*` env → `public/manual-values.json` → (client uses Meta).
 */
export function getMergedDisplayOverrides(): DisplayOverridesPayload {
  const file = readPublicManualFile();
  const out: DisplayOverridesPayload = {};

  const amount = parseEnvNumber('MANUAL_AMOUNT_SPENT') ?? numOrUndef(file.amountSpent);
  if (amount !== undefined) out.amountSpent = amount;

  const balance = parseEnvNumber('MANUAL_BALANCE_LEFT') ?? numOrUndef(file.balanceLeft);
  if (balance !== undefined) out.balanceLeft = balance;

  const lc = parseEnvNumber('MANUAL_LINK_CLICKS') ?? numOrUndef(file.linkClicks);
  if (lc !== undefined) out.linkClicks = lc;

  return out;
}

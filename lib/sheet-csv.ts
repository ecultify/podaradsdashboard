/** Parse a single CSV line with quoted fields. */
export function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out.map((s) => s.replace(/^"|"$/g, ''));
}

function normalizeVariableKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export type SheetKpiRow = {
  totalAmount?: number;
  amountSpent?: number;
  linkClicks?: number;
  testTakers?: number;
};

/**
 * Expect column A = variable name, column B = number (optional header row "variable" / "value").
 * Supported names (case/spacing flexible):
 * - total_amount, total_budget, total, budget_total → totalAmount
 * - amount_spent, spent, amountspent → amountSpent
 * - link_clicks, linkclicks → linkClicks
 */
export function parseKpiSheetCsv(csv: string): SheetKpiRow {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: SheetKpiRow = {};
  let start = 0;
  if (lines.length > 0) {
    const first = parseCsvRow(lines[0]);
    const h = normalizeVariableKey(first[0] || '');
    if (h === 'variable' || h === 'key' || h === 'name' || h === 'field') {
      start = 1;
    }
  }
  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const rawKey = cells[0] || '';
    const rawVal = cells[1] ?? '';
    const key = normalizeVariableKey(rawKey);
    const val = Number(String(rawVal).replace(/,/g, '').trim());
    if (!Number.isFinite(val)) continue;

    if (
      key === 'total_amount' ||
      key === 'total_budget' ||
      key === 'total' ||
      key === 'budget_total' ||
      key === 'budget'
    ) {
      out.totalAmount = val;
    } else if (key === 'amount_spent' || key === 'spent' || key === 'amountspent') {
      out.amountSpent = val;
    } else if (key === 'link_clicks' || key === 'linkclicks') {
      out.linkClicks = val;
    } else if (key === 'test_takers' || key === 'testtakers') {
      out.testTakers = val;
    }
  }
  return out;
}

/** Accept pasted ID or full docs.google.com URL. */
export function normalizeGoogleSheetId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return t;
}

const BROWSER_HEADERS: HeadersInit = {
  Accept: 'text/csv,text/plain,*/*;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

function isProbablyHtml(text: string): boolean {
  const s = text.trimStart().slice(0, 200).toLowerCase();
  return s.startsWith('<!') || s.startsWith('<html') || s.includes('<!doctype html');
}

function hasParsedValues(row: SheetKpiRow): boolean {
  return (
    row.totalAmount !== undefined || row.amountSpent !== undefined || row.linkClicks !== undefined || row.testTakers !== undefined
  );
}

export type SheetFetchResult = {
  row: SheetKpiRow | null;
  /** When row is null: why (for API diagnostics). */
  error: string | null;
};

/**
 * Build list of CSV URLs to try. Google often serves HTML to bare server fetches;
 * the gviz endpoint usually returns real CSV for link-shared sheets.
 */
export function buildCandidateSheetUrls(): string[] {
  const full = process.env.GOOGLE_SHEET_CSV_URL?.trim();
  if (full) {
    if (full.includes('/edit')) {
      const id = normalizeGoogleSheetId(full);
      const gidMatch = full.match(/[#&?]gid=(\d+)/);
      const gid = gidMatch?.[1] ?? process.env.GOOGLE_SHEET_GID?.trim() ?? '0';
      return buildUrlsForId(id, gid);
    }
    if (full.includes('/export?format=csv') || full.includes('/export?format=csv&')) {
      const id = normalizeGoogleSheetId(full);
      const gidMatch = full.match(/[?&]gid=(\d+)/);
      const gid = gidMatch?.[1] ?? process.env.GOOGLE_SHEET_GID?.trim() ?? '0';
      return [full, ...buildUrlsForId(id, gid).filter((u) => u !== full)];
    }
    if (full.includes('spreadsheets/d/')) {
      const id = normalizeGoogleSheetId(full);
      const gidMatch = full.match(/[#&?]gid=(\d+)/);
      const gid = gidMatch?.[1] ?? process.env.GOOGLE_SHEET_GID?.trim() ?? '0';
      return buildUrlsForId(id, gid);
    }
    return [full];
  }

  const idRaw = process.env.GOOGLE_SHEET_ID?.trim();
  if (!idRaw) return [];
  const id = normalizeGoogleSheetId(idRaw);
  const gid = process.env.GOOGLE_SHEET_GID?.trim() ?? '0';
  return buildUrlsForId(id, gid);
}

function buildUrlsForId(id: string, gid: string): string[] {
  // gviz often works more reliably for server-side fetches than /export
  return [
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Sheet1`,
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
  ];
}

export async function fetchKpiSheet(): Promise<SheetFetchResult> {
  const urls = buildCandidateSheetUrls();
  if (urls.length === 0) {
    return { row: null, error: 'no_sheet_env' };
  }

  let lastError = 'unknown';

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: BROWSER_HEADERS,
      });

      if (!res.ok) {
        lastError = `http_${res.status}`;
        continue;
      }

      const text = (await res.text()).replace(/^\uFEFF/, '');
      if (isProbablyHtml(text)) {
        lastError = 'got_html_not_csv';
        continue;
      }

      const row = parseKpiSheetCsv(text);
      if (hasParsedValues(row)) {
        return { row, error: null };
      }

      lastError = 'csv_no_matching_rows';
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { row: null, error: lastError };
}

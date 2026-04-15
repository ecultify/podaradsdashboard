/**
 * Fetches a Google Sheet tab as CSV and returns it as a headers + rows table.
 * Used by the "TOI D-stress spends" tab in the dashboard — schema-agnostic,
 * so whatever columns you paste into the sheet show up in the UI.
 */

export type SpendsTable = {
  headers: string[];
  rows: string[][];
};

export type SpendsTableFetchResult = {
  table: SpendsTable | null;
  error: string | null;
};

const BROWSER_HEADERS: HeadersInit = {
  Accept: 'text/csv,text/plain,*/*;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

function isProbablyHtml(text: string): boolean {
  const s = text.trimStart().slice(0, 200).toLowerCase();
  return s.startsWith('<!') || s.startsWith('<html') || s.includes('<!doctype html');
}

function buildUrlsForId(id: string, gid: string): string[] {
  return [
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
  ];
}

function getSpendsSheetConfig(): { id: string; gid: string } | null {
  const id = process.env.GOOGLE_SPENDS_SHEET_ID?.trim() || process.env.GOOGLE_SHEET_ID?.trim();
  const gid = process.env.GOOGLE_SPENDS_SHEET_GID?.trim();
  if (!id || !gid) return null;
  return { id, gid };
}

/** Drops fully empty rows and trims. Keeps row shape consistent with headers. */
function normalizeTable(headers: string[], rows: string[][]): SpendsTable {
  // Trim trailing columns whose header is empty AND have no data in any row.
  let width = headers.length;
  while (width > 0) {
    const lastHeader = (headers[width - 1] ?? '').trim();
    const colHasData = rows.some((r) => (r[width - 1] ?? '').trim().length > 0);
    if (lastHeader === '' && !colHasData) {
      width -= 1;
      continue;
    }
    break;
  }

  const trimmedHeaders = headers.slice(0, width).map((h) => h.trim());
  const cleanedRows = rows
    .map((r) => {
      const padded = [...r];
      while (padded.length < width) padded.push('');
      return padded.slice(0, width).map((c) => c.trim());
    })
    .filter((r) => r.some((c) => c.length > 0));

  return { headers: trimmedHeaders, rows: cleanedRows };
}

/**
 * Full CSV parser that correctly handles newlines inside quoted fields
 * (important for this sheet — the Creative column often holds multiple URLs
 * separated by newlines within a single cell).
 */
function parseCsvFull(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const c = csv[i];

    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          // Escaped double quote inside a quoted field.
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (c === ',') {
      row.push(cur);
      cur = '';
      i += 1;
      continue;
    }

    if (c === '\r') {
      // Swallow \r; let the \n handle row end (or handle lone \r below).
      if (csv[i + 1] === '\n') {
        i += 1;
        continue;
      }
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i += 1;
      continue;
    }

    if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i += 1;
      continue;
    }

    cur += c;
    i += 1;
  }

  // Flush last field/row.
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }

  return rows;
}

function parseCsvToTable(csv: string): SpendsTable | null {
  const rowsRaw = parseCsvFull(csv);
  if (rowsRaw.length === 0) return null;

  let headerIdx = -1;
  for (let i = 0; i < rowsRaw.length; i++) {
    if (rowsRaw[i].some((c) => c.trim().length > 0)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headers = rowsRaw[headerIdx];
  const rows = rowsRaw.slice(headerIdx + 1);
  return normalizeTable(headers, rows);
}

export async function fetchSpendsSheet(): Promise<SpendsTableFetchResult> {
  const cfg = getSpendsSheetConfig();
  if (!cfg) {
    return {
      table: null,
      error: 'Missing GOOGLE_SPENDS_SHEET_ID and/or GOOGLE_SPENDS_SHEET_GID in env.',
    };
  }

  const urls = buildUrlsForId(cfg.id, cfg.gid);
  let lastError = 'unknown';

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: BROWSER_HEADERS });
      if (!res.ok) {
        lastError = `http_${res.status}`;
        continue;
      }
      const text = (await res.text()).replace(/^\uFEFF/, '');
      if (isProbablyHtml(text)) {
        lastError = 'got_html_not_csv (check sheet is shared as Anyone with link → Viewer)';
        continue;
      }
      const table = parseCsvToTable(text);
      if (table && table.headers.length > 0) {
        return { table, error: null };
      }
      lastError = 'csv_empty_or_no_headers';
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { table: null, error: lastError };
}

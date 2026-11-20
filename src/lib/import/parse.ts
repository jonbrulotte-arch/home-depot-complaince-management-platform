import ExcelJS from "exceljs";
import { toPrimitive, type CellPrimitive } from "./values";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_COLUMNS = 200;
const MAX_ROWS_PER_SHEET = 100_000;
const HEADER_SEARCH_ROWS = 5;

export interface ParsedRow {
  rowNumber: number;
  values: CellPrimitive[];
  /** Non-empty cells under a header */
  filled: number;
}

export interface ParsedSheet {
  name: string;
  /** Header text as it appears in the file; repeated headers get a " (2)" suffix */
  headers: string[];
  rows: ParsedRow[];
  /** True for SPM "<Metric>:RESULT DATA EMPTY" placeholder sheets or sheets with no header */
  empty: boolean;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
}

export class ImportError extends Error {}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    if (!h) return h;
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });
}

function rowValues(row: ExcelJS.Row, width: number): CellPrimitive[] {
  const out: CellPrimitive[] = [];
  for (let c = 1; c <= width; c++) out.push(toPrimitive(row.getCell(c).value));
  return out;
}

export function parseWorksheet(ws: ExcelJS.Worksheet): ParsedSheet {
  const width = Math.min(ws.columnCount, MAX_COLUMNS);
  if (ws.columnCount > MAX_COLUMNS) throw new ImportError(`Sheet "${ws.name}" has more than ${MAX_COLUMNS} columns`);
  if (ws.rowCount > MAX_ROWS_PER_SHEET) throw new ImportError(`Sheet "${ws.name}" has more than ${MAX_ROWS_PER_SHEET} rows`);

  let headerRow = 0;
  let headers: string[] = [];
  for (let r = 1; r <= Math.min(HEADER_SEARCH_ROWS, ws.rowCount); r++) {
    const values = rowValues(ws.getRow(r), width);
    const filled = values.filter((v) => v !== null && v !== "");
    if (filled.some((v) => typeof v === "string" && /RESULT DATA EMPTY/i.test(v))) {
      return { name: ws.name, headers: [], rows: [], empty: true };
    }
    if (filled.length >= 3) {
      headerRow = r;
      headers = dedupeHeaders(values.map((v) => (v === null ? "" : String(v).replace(/\s+/g, " ").trim())));
      break;
    }
  }
  if (!headerRow) return { name: ws.name, headers: [], rows: [], empty: true };

  const rows: ParsedRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const values = rowValues(ws.getRow(r), width);
    // Only count headed columns, so notes typed beside the export are ignored
    const filled = values.filter((v, i) => headers[i] && v !== null && v !== "").length;
    if (filled) rows.push({ rowNumber: r, values, filled });
  }
  return { name: ws.name, headers, rows, empty: false };
}

export async function parseWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParsedWorkbook> {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new ImportError("File is larger than 25 MB");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw new ImportError("File is not a readable .xlsx workbook");
  }
  return { sheets: wb.worksheets.map(parseWorksheet) };
}

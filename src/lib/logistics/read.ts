import ExcelJS from "exceljs";
import { MAX_FILE_BYTES } from "@/lib/import/parse";
import { MAX_LOGISTICS_ROWS, detectKind, parseCsv, parseHtmlTable, poRows, shipmentRows, wmsRows, type LogisticsKind, type Parsed, type PoRow, type ShipmentRow, type WmsRow } from "@/lib/logistics/parse";

// A logistics file (xlsx, CSV or an HTML table) to typed rows of the source it turns out to be.
// No database; import.ts saves the rows.

export type ReadFile =
  | { kind: "WMS"; parsed: Parsed<WmsRow> }
  | { kind: "TMS_SHIPMENTS"; parsed: Parsed<ShipmentRow> }
  | { kind: "TMS_POS"; parsed: Parsed<PoRow> };

const pad = (n: number) => String(n).padStart(2, "0");

/** A cell as text; dates as "YYYY-MM-DD HH:mm:ss" (ExcelJS reads them as UTC wall clock) */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    return "";
  }
  return String(v).trim();
}

async function xlsxRows(bytes: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  // The first sheet that looks like one of the sources
  for (const ws of wb.worksheets) {
    if (ws.rowCount > MAX_LOGISTICS_ROWS) throw new Error(`Sheet "${ws.name}" has more than ${MAX_LOGISTICS_ROWS.toLocaleString()} rows`);
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as ExcelJS.CellValue[];
      rows.push(values.slice(1, 201).map(cellText));
    });
    if (detectKind(rows)) return rows;
  }
  return [];
}

/** Rows of the file, whatever its format: xlsx (by content), an HTML table, or CSV. */
export async function fileRows(bytes: Uint8Array): Promise<string[][]> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("The file is larger than 25 MB");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return xlsxRows(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  if (/^\s*</.test(text) && /<table/i.test(text)) return parseHtmlTable(text);
  return parseCsv(text);
}

/** Reads and recognises a file; throws with a message for the user when it is none of the three. */
export async function readLogisticsFile(bytes: Uint8Array): Promise<ReadFile> {
  const rows = await fileRows(bytes);
  const found = detectKind(rows);
  if (!found)
    throw new Error("Not a WMS shipped-lines report, TMS shipments export or TMS purchase orders export (the column headers weren't recognised)");
  const kind: LogisticsKind = found.kind;
  if (kind === "WMS") return { kind, parsed: wmsRows(rows, found.headerIndex) };
  if (kind === "TMS_SHIPMENTS") return { kind, parsed: shipmentRows(rows, found.headerIndex) };
  return { kind, parsed: poRows(rows, found.headerIndex) };
}

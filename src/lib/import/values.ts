// Cell value coercion for SPM exports. Exports mix real Excel dates, "MM/DD/YYYY",
// "MM-DD-YYYY", "MM/DD/YYYY hh:mm AM" and "YYYY-MM-DD HH:mm:ss" strings, and use "-",
// "--" or "Not Available" for blanks. All timestamps are stored as UTC wall-clock time
// (the exports carry no time zone), so display them with timeZone "UTC".

export type CellPrimitive = string | number | boolean | Date | null;

const BLANKS = new Set(["", "-", "--", "n/a", "na", "not available", "null", "none"]);

export function normalizeHeader(header: unknown): string {
  return String(header ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Flattens ExcelJS cell values (rich text, formulas, hyperlinks, errors) to primitives. */
export function toPrimitive(value: unknown): CellPrimitive {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) return (v.richText as { text: string }[]).map((r) => r.text).join("").trim();
    if ("result" in v) return toPrimitive(v.result);
    if ("text" in v) return toPrimitive(v.text);
    if ("error" in v) return null;
  }
  return String(value);
}

export function isBlank(value: CellPrimitive): boolean {
  return value === null || (typeof value === "string" && BLANKS.has(value.trim().toLowerCase()));
}

export function toText(value: CellPrimitive): string | null {
  if (isBlank(value)) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function toNumber(value: CellPrimitive): number | null {
  if (isBlank(value) || value instanceof Date || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[$,%\s]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function toBoolean(value: CellPrimitive): boolean | null {
  if (isBlank(value)) return null;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

const US_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

function utc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export function toDate(value: CellPrimitive): Date | null {
  if (isBlank(value) || typeof value === "boolean") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30); only accept a plausible range
    if (value < 20000 || value > 80000) return null;
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  // Multi-value cells ("229663843\n229686171") keep only the first entry
  const s = String(value).split(/\r?\n/)[0].trim();
  let m = US_DATE.exec(s);
  if (m) {
    let hour = m[4] ? Number(m[4]) : 0;
    const ampm = m[7]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return utc(Number(m[3]), Number(m[1]), Number(m[2]), hour, m[5] ? Number(m[5]) : 0, m[6] ? Number(m[6]) : 0);
  }
  m = ISO_DATE.exec(s);
  if (m) {
    return utc(Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0, m[6] ? Number(m[6]) : 0);
  }
  return null;
}

/** JSON-safe copy of a cell for the raw column store. */
export function toJsonValue(value: CellPrimitive): string | number | boolean | null {
  if (value instanceof Date) return value.toISOString();
  return value;
}

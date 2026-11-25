// Logistics files to rows: CSV (TMS Logistics Gateway exports), an HTML table (some WMS report
// links answer with one) and the header detection that tells the three sources apart. Pure and
// unit-tested; xlsx files are read with ExcelJS in import.ts and come here as string rows.

export type LogisticsKind = "WMS" | "TMS_SHIPMENTS" | "TMS_POS" | "ASN" | "POM";

export const LOGISTICS_KIND_LABELS: Record<LogisticsKind, string> = {
  WMS: "WMS shipped lines",
  TMS_SHIPMENTS: "TMS shipments",
  TMS_POS: "TMS purchase orders",
  ASN: "ASN/Shipped confirmations",
  POM: "POM purchase orders (Supplier Hub)",
};

/** The ASN/Shipped Confirmation file's two columns, as the export writes them */
export const ASN_HEADERS = { po: "PO Number", status: "ASN/Ship Status" } as const;
export const ASN_STATUS_LABELS = { UNSHIPPED: "Unshipped", SHIPPED: "Shipped" } as const;
export type AsnStatusValue = keyof typeof ASN_STATUS_LABELS;

/** "Shipped" → SHIPPED; "Unshipped" or blank → UNSHIPPED (the default); anything else → null */
export function parseAsnStatus(v: string): AsnStatusValue | null {
  const k = v.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!k || k === "unshipped" || k === "notshipped") return "UNSHIPPED";
  if (k === "shipped" || k === "asnreceived") return "SHIPPED";
  return null;
}

export const MAX_LOGISTICS_ROWS = 200_000;

/** RFC 4180 CSV: quoted fields with commas, quotes ("") and line breaks; a BOM is ignored. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length > MAX_LOGISTICS_ROWS) throw new Error(`The file has more than ${MAX_LOGISTICS_ROWS.toLocaleString()} rows`);
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .trim();

/** The first HTML table's rows (th and td cells), for report links that answer with HTML. */
export function parseHtmlTable(html: string): string[][] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const rows: string[][] = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    rows.push([...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => decode(m[1])));
    if (rows.length > MAX_LOGISTICS_ROWS) throw new Error(`The table has more than ${MAX_LOGISTICS_ROWS.toLocaleString()} rows`);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

/** "Origin State/Prov." → "originstateprov" */
export const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const SIGNATURES: [LogisticsKind, string[]][] = [
  // THD's POM (Purchase Order Management) PO search export: a row per PO and SKU
  ["POM", ["purchaseorder", "postatus", "skuorderqty"]],
  ["WMS", ["customerponumber", "trackingnumber"]],
  ["TMS_SHIPMENTS", ["shipment", "assignedcarrier", "purchaseorders"]],
  ["TMS_POS", ["purchaseorder", "destinationfacility"]],
];

/** Which file this is, from its header row (the first row with at least three filled cells, or the ASN file's two). */
export function detectKind(rows: string[][]): { kind: LogisticsKind; headerIndex: number } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const keys = rows[i].map(headerKey);
    if (keys.includes("ponumber") && keys.some((k) => k === "asnshipstatus" || k === "asnstatus")) return { kind: "ASN", headerIndex: i };
    if (keys.filter(Boolean).length < 3) continue;
    const hit = SIGNATURES.find(([, need]) => need.every((k) => keys.includes(k)));
    return hit ? { kind: hit[0], headerIndex: i } : null;
  }
  return null;
}

/** Rows as objects keyed by headerKey, for the rows below the header. */
export function rowsAsRecords(rows: string[][], headerIndex: number): Record<string, string>[] {
  const keys = rows[headerIndex].map(headerKey);
  return rows.slice(headerIndex + 1).map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => {
      // The first column with a name wins (TMS repeats none today, but be safe)
      if (k && !(k in rec)) rec[k] = (r[i] ?? "").trim();
    });
    return rec;
  });
}

const pick = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (r[k]) return r[k];
  return "";
};
const opt = (v: string) => v || null;
const YES_COLUMNS: [string, string][] = [
  ["errors", "Errors"],
  ["warnings", "Warnings"],
  ["alerts", "Alerts"],
  ["notes", "Notes"],
  ["note", "Notes"],
  ["events", "Events"],
  ["eventnotificationindicator", "Event notification"],
];
const tmsFlags = (r: Record<string, string>) => [...new Set(YES_COLUMNS.filter(([k]) => /^y(es)?$/i.test(r[k] ?? "")).map(([, l]) => l))];
/** "1181331860, 1181351361" → the PO numbers */
export const splitPos = (v: string) => [...new Set(v.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean))];

// ─── Time ─────────────────────────────────────────────────────────

/** UTC offsets (hours) of the zone abbreviations TMS writes */
const ZONES: Record<string, number> = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, AKST: -9, AKDT: -8, HST: -10, AST: -4, ADT: -3, UTC: 0, GMT: 0 };

export interface LocalTime {
  /** The instant */
  at: Date;
  /** As written, e.g. "9/22/26 00:01 EDT" */
  local: string;
  /** The local calendar date, YYYY-MM-DD */
  date: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "9/22/26 00:01" + "EDT" (also four-digit years and AM/PM) → the instant and the local date. */
export function parseTmsTime(value: string, zone: string): LocalTime | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?$/i);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  let hour = Number(m[4] ?? 0);
  if (m[7]) hour = (hour % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;
  const tz = zone.trim().toUpperCase();
  const offset = ZONES[tz] ?? 0;
  const at = new Date(Date.UTC(year, month - 1, day, hour - offset, Number(m[5] ?? 0), Number(m[6] ?? 0)));
  return { at, local: `${value.trim()}${tz ? ` ${tz}` : ""}`, date: `${year}-${pad(month)}-${pad(day)}` };
}

/** The local date (YYYY-MM-DD) of a time as TMS writes it ("9/22/26 00:01 EDT"). */
export const localDateOf = (local: string | null | undefined) => (local ? (parseTmsTime(local.replace(/\s+[A-Z]{2,4}$/, ""), "")?.date ?? null) : null);

/** A WMS ship time ("2026-11-12 06:24:00", "11/12/2026 6:24 AM") as a UTC-labelled wall-clock Date. */
export function parseWmsTime(value: string): Date | null {
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0)));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseTmsTime(v, "UTC")?.at ?? null;
}

// ─── Rows of each source ──────────────────────────────────────────

export interface WmsRow {
  /** label|product: a mixed carton has a line per product */
  lineKey: string;
  label: string;
  orderNum: string;
  orderNumber: string | null;
  customer: string | null;
  trackingNumber: string | null;
  secondTrack: string | null;
  totLabel: string | null;
  product: string | null;
  quantity: number | null;
  poNumber: string;
  shippedAt: Date;
  shipTo: string | null;
  shipName: string | null;
  shipAddress1: string | null;
  shipAddress2: string | null;
  shipAddress3: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
}

export interface ShipmentRow {
  shipmentNumber: string;
  status: string;
  scac: string | null;
  pickup: LocalTime | null;
  delivery: LocalTime | null;
  originFacility: string | null;
  originCity: string | null;
  originState: string | null;
  destFacility: string | null;
  destCity: string | null;
  destState: string | null;
  poNumbers: string[];
  appointment: string | null;
  tmsFlags: string[];
  raw: Record<string, string>;
}

export interface PoRow {
  poNumber: string;
  status: string;
  originFacility: string | null;
  originCity: string | null;
  originState: string | null;
  destFacility: string | null;
  destCity: string | null;
  destState: string | null;
  businessPartner: string | null;
  appointment: string | null;
  tmsFlags: string[];
  raw: Record<string, string>;
}

export type Parsed<T> = { rows: T[]; skipped: { row: number; reason: string }[] };

function collect<T>(records: Record<string, string>[], headerIndex: number, map: (r: Record<string, string>) => T | string): Parsed<T> {
  const out: Parsed<T> = { rows: [], skipped: [] };
  records.forEach((r, i) => {
    const v = map(r);
    // Row numbers as a spreadsheet shows them (1-based, after the header)
    if (typeof v === "string") out.skipped.push({ row: headerIndex + i + 2, reason: v });
    else out.rows.push(v);
  });
  return out;
}

export function wmsRows(rows: string[][], headerIndex: number): Parsed<WmsRow> {
  return collect(rowsAsRecords(rows, headerIndex), headerIndex, (r) => {
    const po = pick(r, "customerponumber", "ponumber");
    const label = pick(r, "gs128", "sscc", "label", "totlabel");
    const shippedAt = parseWmsTime(pick(r, "shipdate", "shippeddate"));
    if (!po) return "No customer PO number";
    if (!label) return "No carton label (GS128 or TOTLABEL)";
    if (!shippedAt) return "No readable ship date";
    const qty = Number(pick(r, "quantity", "qty"));
    return {
      lineKey: `${label}|${pick(r, "product", "sku")}`,
      label,
      orderNum: pick(r, "ordernum", "ordernumber"),
      orderNumber: opt(pick(r, "ordernumber")),
      customer: opt(pick(r, "custnum", "customer")),
      trackingNumber: opt(pick(r, "trackingnumber")),
      secondTrack: opt(pick(r, "secondtrack")),
      totLabel: opt(pick(r, "totlabel")),
      product: opt(pick(r, "product", "sku")),
      quantity: Number.isFinite(qty) && pick(r, "quantity", "qty") !== "" ? Math.round(qty) : null,
      poNumber: po,
      shippedAt,
      shipTo: opt(pick(r, "shipto")),
      shipName: opt(pick(r, "shipname")),
      shipAddress1: opt(pick(r, "shipadd1", "shipaddress1")),
      shipAddress2: opt(pick(r, "shipadd2", "shipaddress2")),
      shipAddress3: opt(pick(r, "shipadd3", "shipaddress3")),
      shipCity: opt(pick(r, "shipcity")),
      shipState: opt(pick(r, "shipprov", "shipstate")),
      shipZip: opt(pick(r, "shipzip")),
    };
  });
}

export function shipmentRows(rows: string[][], headerIndex: number): Parsed<ShipmentRow> {
  return collect(rowsAsRecords(rows, headerIndex), headerIndex, (r) => {
    const shipmentNumber = pick(r, "shipment", "shipmentid");
    if (!shipmentNumber) return "No shipment number";
    return {
      shipmentNumber,
      status: pick(r, "status") || "Unknown",
      scac: opt(pick(r, "assignedcarrier", "carrier", "scac").toUpperCase()),
      pickup: parseTmsTime(pick(r, "pickupstart"), pick(r, "pickupstarttz")),
      delivery: parseTmsTime(pick(r, "deliverystart"), pick(r, "deliverystarttz")),
      originFacility: opt(pick(r, "originfacility")),
      originCity: opt(pick(r, "origincity")),
      originState: opt(pick(r, "originstateprov", "originstate")),
      destFacility: opt(pick(r, "destfacility", "destinationfacility")),
      destCity: opt(pick(r, "destcity", "destinationcity")),
      destState: opt(pick(r, "deststateprov", "destinationstateprov", "deststate")),
      poNumbers: splitPos(pick(r, "purchaseorders")),
      appointment: opt(pick(r, "appointmenttime")),
      tmsFlags: tmsFlags(r),
      raw: r,
    };
  });
}

/** "11/24/2026", "2026-11-24" or "2026-11-24 00:00:00" (an Excel date) → "2026-11-24" */
export function pomDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "$1134.72", "1,134.72" → 1134.72; blank → null */
export function pomNumber(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** One row of THD's POM PO search export: the PO's header (repeated on each row) and one SKU line */
export interface PomRow {
  poNumber: string;
  dept: string | null;
  poCreateDate: string | null;
  poType: string | null;
  status: string;
  buyer: string | null;
  reasonCode: string | null;
  soq: string | null;
  vendorNumber: string | null;
  totalQty: number | null;
  totalCost: number | null;
  /** Expected ship date */
  esd: string | null;
  dcDueDate: string | null;
  factory: string | null;
  containerType: string | null;
  portOfLading: string | null;
  destinationDc: string | null;
  /** "RDC", "IFC" or blank */
  crossDock: string | null;
  finalRecvLocation: string | null;
  transferPo: string | null;
  mode: string | null;
  lingerDate: string | null;
  thdSku: string | null;
  description: string | null;
  /** Our SKU (the WMS product) */
  partNumber: string | null;
  skuStatus: string | null;
  orderQty: number | null;
  adjOrderQty: number | null;
  shippedQty: number | null;
  receivedQty: number | null;
  unitCost: number | null;
  raw: Record<string, string>;
}

/** THD's POM PO search export (Supplier Hub › Purchase Order Management), as-is */
export function pomRows(rows: string[][], headerIndex: number): Parsed<PomRow> {
  return collect(rowsAsRecords(rows, headerIndex), headerIndex, (r) => {
    const poNumber = pick(r, "purchaseorder").replace(/\s+/g, "");
    if (!poNumber) return "No PurchaseOrder #";
    const int = (k: string) => {
      const n = pomNumber(pick(r, k));
      return n === null ? null : Math.round(n);
    };
    return {
      poNumber,
      dept: opt(pick(r, "dept")),
      poCreateDate: pomDate(pick(r, "pocreatedate")),
      poType: opt(pick(r, "potype")),
      status: pick(r, "postatus") || "Unknown",
      buyer: opt(pick(r, "buyer")),
      reasonCode: opt(pick(r, "reasoncode")),
      soq: opt(pick(r, "soq")),
      vendorNumber: opt(pick(r, "vendor")),
      totalQty: int("totalpoqty"),
      totalCost: pomNumber(pick(r, "totalpocost")),
      esd: pomDate(pick(r, "esd")),
      dcDueDate: pomDate(pick(r, "dcduedate")),
      factory: opt(pick(r, "factory")),
      containerType: opt(pick(r, "containertype")),
      portOfLading: opt(pick(r, "portoflading")),
      destinationDc: opt(pick(r, "destinationdc")),
      crossDock: opt(pick(r, "crossdock")),
      finalRecvLocation: opt(pick(r, "finalrecvlocation")),
      transferPo: opt(pick(r, "transferpo")),
      mode: opt(pick(r, "mode")),
      lingerDate: pomDate(pick(r, "lingerdate")),
      thdSku: opt(pick(r, "sku")),
      description: opt(pick(r, "skudescription")),
      partNumber: opt(pick(r, "skupart")),
      skuStatus: opt(pick(r, "skustatus")),
      orderQty: int("skuorderqty"),
      adjOrderQty: int("skuadjorderqty"),
      shippedQty: int("skushippedqty"),
      receivedQty: int("skureceivedqty"),
      unitCost: pomNumber(pick(r, "skuunitcostamount")),
      raw: r,
    };
  });
}

export interface AsnRow {
  poNumber: string;
  status: AsnStatusValue;
}

/** The ASN/Shipped Confirmation file: a status per PO (blank = Unshipped) */
export function asnRows(rows: string[][], headerIndex: number): Parsed<AsnRow> {
  return collect(rowsAsRecords(rows, headerIndex), headerIndex, (r) => {
    const poNumber = pick(r, "ponumber").replace(/\s+/g, "");
    if (!poNumber) return "No PO number";
    const raw = r.asnshipstatus ?? r.asnstatus ?? "";
    const status = parseAsnStatus(raw);
    if (!status) return `ASN/Ship Status "${raw}" isn't Unshipped or Shipped`;
    return { poNumber, status };
  });
}

export function poRows(rows: string[][], headerIndex: number): Parsed<PoRow> {
  return collect(rowsAsRecords(rows, headerIndex), headerIndex, (r) => {
    const poNumber = pick(r, "purchaseorder");
    if (!poNumber) return "No purchase order number";
    const appt = pick(r, "appointmenttime");
    return {
      poNumber,
      status: pick(r, "status") || "Unknown",
      originFacility: opt(pick(r, "originfacility")),
      originCity: opt(pick(r, "origincity")),
      originState: opt(pick(r, "originstateprov", "originstate")),
      destFacility: opt(pick(r, "destinationfacility", "destfacility")),
      destCity: opt(pick(r, "destinationcity", "destcity")),
      destState: opt(pick(r, "destinationstateprov", "deststateprov")),
      businessPartner: opt(pick(r, "businesspartner")),
      appointment: appt ? `${appt}${pick(r, "appointmenttimetz") ? ` ${pick(r, "appointmenttimetz")}` : ""}` : null,
      tmsFlags: tmsFlags(r),
      raw: r,
    };
  });
}

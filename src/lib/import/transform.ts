import { createHash } from "node:crypto";
import { isFiscalMonth } from "@/lib/fiscal";
import { periodLabel, periodOfMetric } from "@/lib/shipment-ranges";
import type { DataPeriod } from "@prisma/client";
import { FULL_POPULATION_METRICS } from "./catalog";
import type { ParsedRow, ParsedSheet, ParsedWorkbook } from "./parse";
import { normalizeHeader, toBoolean, toDate, toJsonValue, toNumber, toText, type CellPrimitive } from "./values";

export type ExportKind = "ALL_RESULTS" | "NON_COMPLIANT" | "UNKNOWN";

export interface ConfigMetric {
  id: string;
  code: string;
  name: string;
  sheetNames: string[];
}

export interface ConfigProgram {
  id: string;
  code: string;
  name: string;
  filePrefix: string | null;
  metrics: ConfigMetric[];
}

export interface ConfigAlias {
  programId: string | null;
  metricId: string | null;
  sourceHeader: string;
  canonicalField: string;
}

const TEXT_FIELDS = [
  "poNumber", "dcNumber", "sku", "vendorSku", "skuDescription", "customerOrder", "omsId", "trackingNumber",
  "bolNumber", "tmsId", "shipmentNumber", "docTraceId", "carrierUsed", "carrierPro", "rgCarriers", "originState",
  "destinationState", "freightTerms", "invoiceNumber", "offsetType", "reason", "lateReason", "spmStatus",
  "spmDisputeReason", "spmSupplierComment", "spmDecision", "spmDecisionDetail", "spmCoordinatorComment",
] as const;
const NUMBER_FIELDS = ["orderedQty", "receivedQty", "fillRatePct", "businessDaysLate"] as const;
const DATE_FIELDS = [
  "poCreateDate", "expectedArrivalDate", "estShipDate", "estDeliveryDate", "actualShipDate", "rtsSent",
  "pickupRequestDate", "trailerCheckIn", "asnTimestamp", "asnReceivedAt", "closedDate", "cancelDate",
] as const;
/** Fields used to build the PO record rather than stored on the line */
const PO_FIELDS = ["pVendor", "mVendor", "mVendorName", "dept"] as const;

export const CANONICAL_FIELDS = [
  ...TEXT_FIELDS, ...NUMBER_FIELDS, ...DATE_FIELDS, ...PO_FIELDS, "rescheduled", "offset", "fiscalMonth",
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

type TextField = (typeof TEXT_FIELDS)[number];
type NumberField = (typeof NUMBER_FIELDS)[number];
type DateField = (typeof DATE_FIELDS)[number];

export type LineFields = { [K in TextField]?: string | null } & { [K in NumberField]?: number | null } & {
  [K in DateField]?: Date | null;
} & { rescheduled?: boolean | null };

export interface PoInfo {
  poNumber: string;
  pVendor: string | null;
  mVendor: string | null;
  mVendorName: string | null;
  dept: string | null;
  dcNumber: string | null;
  poCreateDate: Date | null;
}

export interface MappedLine {
  metricId: string;
  metricCode: string;
  lineKey: string;
  fiscalMonth: number;
  isCompliant: boolean;
  offsetAmount: number;
  fields: LineFields;
  po: PoInfo | null;
  raw: Record<string, string | number | boolean | null>;
  sourceSheet: string;
  sourceRow: number;
  /** From a sheet that belongs to the report's other compliance period: it may update an existing line but never adds one */
  updateOnly?: boolean;
}

export interface SummaryRowData {
  metricId: string | null;
  metricLabel: string;
  /** null for the P-Vendor totals block */
  mVendor: string | null;
  programStatus: string | null;
  totalLines: number | null;
  compliantLines: number | null;
  nonCompliantLines: number | null;
  offsetsPreDispute: number | null;
  offsetsPostDispute: number | null;
  disputedLines: number | null;
  approvedLines: number | null;
  deniedLines: number | null;
  thresholdPct: number | null;
  preDisputePerfPct: number | null;
  postDisputePerfPct: number | null;
}

export interface MetricPreview {
  metricId: string;
  code: string;
  name: string;
  sheet: string;
  total: number;
  nonCompliant: number;
  offset: number;
  unmappedHeaders: string[];
  /** The metric belongs to the other compliance period than the one being imported */
  outOfPeriod?: boolean;
}

export interface ImportPreview {
  programId: string;
  programCode: string;
  exportKind: ExportKind;
  fiscalMonths: Record<number, number>;
  metrics: MetricPreview[];
  emptySheets: string[];
  summary: SummaryRowData[];
  lines: MappedLine[];
  warnings: string[];
}

export function detectExportKind(fileName: string): ExportKind {
  const upper = fileName.toUpperCase();
  if (upper.includes("NON_COMPLIANT")) return "NON_COMPLIANT";
  if (upper.includes("ALL_RESULTS")) return "ALL_RESULTS";
  return "UNKNOWN";
}

function sheetMatches(metric: ConfigMetric, sheetName: string): boolean {
  const name = normalizeHeader(sheetName);
  return metric.sheetNames.some((s) => normalizeHeader(s) === name);
}

/** Program from the SPM filename prefix (longest match wins), else from sheet names. */
export function detectProgram(fileName: string, sheetNames: string[], programs: ConfigProgram[]): ConfigProgram | null {
  const base = fileName.split(/[\\/]/).pop()!.toUpperCase();
  const byPrefix = programs
    .filter((p) => p.filePrefix && (base === p.filePrefix.toUpperCase() || base.startsWith(`${p.filePrefix.toUpperCase()}_`)))
    .sort((a, b) => b.filePrefix!.length - a.filePrefix!.length);
  if (byPrefix.length) return byPrefix[0];

  let best: ConfigProgram | null = null;
  let bestScore = 0;
  for (const p of programs) {
    const score = sheetNames.filter((s) => p.metrics.some((m) => sheetMatches(m, s))).length;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

/** Metric-scoped alias beats program-scoped, which beats global. */
export function resolveAliases(aliases: ConfigAlias[], programId: string, metricId: string): Map<string, string> {
  const rank = (a: ConfigAlias) => (a.metricId ? 2 : a.programId ? 1 : 0);
  const map = new Map<string, string>();
  const best = new Map<string, number>();
  for (const a of aliases) {
    if (a.metricId && a.metricId !== metricId) continue;
    if (a.programId && a.programId !== programId) continue;
    const key = normalizeHeader(a.sourceHeader);
    if ((best.get(key) ?? -1) < rank(a)) {
      best.set(key, rank(a));
      map.set(key, a.canonicalField);
    }
  }
  return map;
}

/**
 * Decides whether a line is compliant. `hasOffset` is true when the row carries a numeric
 * offset (including 0): sheets such as Multiple BOL list compliant rows with a $0 offset,
 * while ASN sheets and unknown programs list violations only.
 */
export function classifyLine(
  metricCode: string,
  fields: LineFields,
  offset: number,
  hasOffset: boolean,
  exportKind: ExportKind,
): boolean {
  if (exportKind === "NON_COMPLIANT") return false;
  if (offset > 0) return false;
  if (fields.spmStatus && !/^pending supplier$/i.test(fields.spmStatus)) return false;
  if (metricCode === "FILL_RATE") {
    if (fields.cancelDate) return false;
    if (fields.fillRatePct != null && fields.fillRatePct < 100) return false;
    if (fields.orderedQty != null && fields.receivedQty != null && fields.receivedQty < fields.orderedQty) return false;
  }
  if (metricCode === "ON_TIME") {
    if (fields.businessDaysLate != null && fields.businessDaysLate > 0) return false;
    if (fields.lateReason) return false;
  }
  if (metricCode === "ASN_TIMELINESS" && fields.trailerCheckIn) {
    // Legacy (pre-Nov 2023) sheet: the ASN must be transmitted before the trailer checks in
    if (!fields.asnTimestamp || fields.asnTimestamp > fields.trailerCheckIn) return false;
  }
  if (FULL_POPULATION_METRICS.has(metricCode)) return true;
  return hasOffset;
}

const KEY_FIELDS: TextField[] = [
  "poNumber", "sku", "vendorSku", "docTraceId", "tmsId", "carrierPro", "omsId", "customerOrder",
  "trackingNumber", "shipmentNumber", "bolNumber", "reason",
];

function lineKeyBase(metricCode: string, fiscalMonth: number, fields: LineFields): string {
  return [metricCode, fiscalMonth, ...KEY_FIELDS.map((f) => fields[f] ?? "")].join("|");
}

function hashKey(base: string, occurrence: number): string {
  return createHash("sha256").update(`${base}#${occurrence}`).digest("hex").slice(0, 40);
}

interface MappedRow {
  fields: LineFields;
  po: Record<string, string | null>;
  fiscalMonth: number | null;
  offset: number;
  hasOffset: boolean;
  /** THD's US_TRANS exports sometimes drop the department value, shifting the offset under "Department #" */
  shiftedOffset: boolean;
  raw: MappedLine["raw"];
}

function mapRow(sheet: ParsedSheet, values: CellPrimitive[], aliasMap: Map<string, string>): MappedRow {
  const fields: LineFields = {};
  const po: Record<string, string | null> = {};
  const raw: MappedLine["raw"] = {};
  const rgCarriers: string[] = [];
  const deptValues: CellPrimitive[] = [];
  let fiscalMonth: number | null = null;
  let offset: number | null = null;
  let hasOffsetColumn = false;

  sheet.headers.forEach((header, i) => {
    if (!header) return;
    const value = values[i] ?? null;
    raw[header] = toJsonValue(value);
    // Strip the " (2)" suffix added for repeated headers before looking up the alias
    const field = aliasMap.get(normalizeHeader(header.replace(/ \(\d+\)$/, "")));
    if (!field) return;

    if (field === "rgCarriers") {
      const text = toText(value);
      if (text) rgCarriers.push(text);
    } else if (field === "offset") {
      hasOffsetColumn = true;
      offset = toNumber(value);
    } else if (field === "fiscalMonth") {
      const n = toNumber(value);
      if (n !== null && isFiscalMonth(n)) fiscalMonth = n;
    } else if (field === "rescheduled") {
      fields.rescheduled = toBoolean(value);
    } else if (field === "dept") {
      deptValues.push(value);
      po.dept ??= toText(value);
    } else if ((PO_FIELDS as readonly string[]).includes(field)) {
      po[field] ??= toText(value);
    } else if ((NUMBER_FIELDS as readonly string[]).includes(field)) {
      fields[field as NumberField] ??= toNumber(value);
    } else if ((DATE_FIELDS as readonly string[]).includes(field)) {
      fields[field as DateField] ??= toDate(value);
    } else if ((TEXT_FIELDS as readonly string[]).includes(field)) {
      // A repeated column (e.g. two "PO Number" headers) never overwrites the first value
      fields[field as TextField] ??= toText(value);
    }
  });
  if (rgCarriers.length) fields.rgCarriers = rgCarriers.join(", ");

  let shiftedOffset = false;
  if (hasOffsetColumn && offset === null && deptValues.length >= 2) {
    const last = toNumber(deptValues[deptValues.length - 1]);
    if (last !== null && typeof deptValues[deptValues.length - 1] === "number") {
      offset = last;
      shiftedOffset = true;
    }
  }
  return { fields, po, fiscalMonth, offset: offset ?? 0, hasOffset: offset !== null, shiftedOffset, raw };
}

const SUMMARY_COLUMNS = {
  metric: "metric",
  status: "program status",
  total: "total lines",
  compliant: "compliant lines",
  nonCompliant: "non-compliant lines",
  pre: "offsets pre-dispute",
  post: "offsets post-dispute",
  disputed: "disputed lines",
  approved: "approved lines",
  denied: "denied lines",
  threshold: "threshold",
  prePerf: "pre-dispute performance",
  postPerf: "post-dispute performance",
} as const;

/**
 * The SPM Summary sheet holds a P-Vendor totals block followed by one block per M-Vendor
 * ("M-Vendor:20632" title row, then its own header row with threshold and performance).
 */
function parseSummary(sheet: ParsedSheet, program: ConfigProgram): SummaryRowData[] {
  const out: SummaryRowData[] = [];
  // The parser treats the first block's header as the sheet header; re-scan every row instead
  const allRows: CellPrimitive[][] = [sheet.headers, ...sheet.rows.map((r) => r.values)];
  let columns: Partial<Record<keyof typeof SUMMARY_COLUMNS, number>> | null = null;
  let mVendor: string | null = null;

  for (const values of allRows) {
    const texts = values.map((v) => normalizeHeader(v));
    const title = texts.find((t) => t.startsWith("m-vendor:"));
    if (title) {
      mVendor = title.slice("m-vendor:".length).trim() || null;
      columns = null;
      continue;
    }
    if (texts[0] === "metric") {
      columns = {};
      for (const [key, header] of Object.entries(SUMMARY_COLUMNS)) {
        const i = texts.indexOf(header);
        if (i >= 0) columns[key as keyof typeof SUMMARY_COLUMNS] = i;
      }
      continue;
    }
    if (!columns || columns.metric === undefined) continue;
    const label = toText(values[columns.metric] ?? null);
    if (!label) continue;
    const num = (key: keyof typeof SUMMARY_COLUMNS) => {
      const i = columns![key];
      return i === undefined ? null : toNumber(values[i] ?? null);
    };
    const metric = program.metrics.find(
      (m) => sheetMatches(m, label) || normalizeHeader(m.name) === normalizeHeader(label) || m.code === label.toUpperCase().replace(/\s+/g, "_"),
    );
    out.push({
      metricId: metric?.id ?? null,
      metricLabel: label,
      mVendor,
      programStatus: columns.status === undefined ? null : toText(values[columns.status] ?? null),
      totalLines: num("total"),
      compliantLines: num("compliant"),
      nonCompliantLines: num("nonCompliant"),
      offsetsPreDispute: num("pre"),
      offsetsPostDispute: num("post"),
      disputedLines: num("disputed"),
      approvedLines: num("approved"),
      deniedLines: num("denied"),
      thresholdPct: num("threshold"),
      preDisputePerfPct: num("prePerf"),
      postDisputePerfPct: num("postPerf"),
    });
  }
  return out;
}

/**
 * Exports are sometimes annotated by hand with subtotal or recap rows below the data. Those
 * fill only a few columns, so drop rows far sparser than the sheet's typical row.
 */
function dropSparseRows(rows: ParsedRow[]): { rows: ParsedRow[]; skipped: number } {
  const sorted = rows.map((r) => r.filled).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const minFilled = Math.min(3, median);
  const kept = rows.filter((r) => r.filled >= minFilled && r.filled >= median * 0.3);
  return { rows: kept, skipped: rows.length - kept.length };
}

export interface TransformOptions {
  fileName: string;
  program: ConfigProgram;
  aliases: ConfigAlias[];
  /** Used for lines whose export has no fiscal month column (US Drop Ship) */
  fallbackFiscalMonth: number;
  /** When importing into a report, warn if line fiscal months differ */
  expectedFiscalMonth?: number;
  /** The report's compliance period this file is for; sheets of the other period become update-only */
  period?: DataPeriod;
}

/** `sourceSheet` of lines built from THD's Summary totals in a summary-only export (no PO detail) */
export const SUMMARY_SHEET = "Summary";

export function transformWorkbook(workbook: ParsedWorkbook, opts: TransformOptions): ImportPreview {
  const { program } = opts;
  let exportKind = detectExportKind(opts.fileName);
  const warnings: string[] = [];
  const metrics: MetricPreview[] = [];
  const emptySheets: string[] = [];
  const lines: MappedLine[] = [];
  const fiscalMonths: Record<number, number> = {};
  let summary: SummaryRowData[] = [];
  const occurrences = new Map<string, number>();
  let shiftedRows = 0;

  for (const sheet of workbook.sheets) {
    if (normalizeHeader(sheet.name) === "summary") {
      if (!sheet.empty) summary = parseSummary(sheet, program);
      continue;
    }
    const metric = program.metrics.find((m) => sheetMatches(m, sheet.name));
    if (!metric) {
      if (!sheet.empty) warnings.push(`Sheet "${sheet.name}" does not match any ${program.name} metric and was skipped.`);
      continue;
    }
    if (sheet.empty) {
      emptySheets.push(sheet.name);
      continue;
    }

    const { rows, skipped } = dropSparseRows(sheet.rows);
    if (skipped) {
      warnings.push(`Sheet "${sheet.name}": ignored ${skipped} sparse row(s) that look like hand-added subtotals or notes.`);
    }
    const outOfPeriod = opts.period !== undefined && periodOfMetric(metric.code) !== opts.period;
    const aliasMap = resolveAliases(opts.aliases, program.id, metric.id);
    const unmappedHeaders = sheet.headers.filter((h) => h && !aliasMap.has(normalizeHeader(h.replace(/ \(\d+\)$/, ""))));
    const preview: MetricPreview = {
      metricId: metric.id, code: metric.code, name: metric.name, sheet: sheet.name,
      total: 0, nonCompliant: 0, offset: 0, unmappedHeaders, ...(outOfPeriod ? { outOfPeriod } : {}),
    };
    if (!sheet.headers.some((h) => aliasMap.get(normalizeHeader(h)) === "poNumber")) {
      warnings.push(`Sheet "${sheet.name}" has no PO Number column; lines will not link to PO records.`);
    }

    for (const row of rows) {
      const mapped = mapRow(sheet, row.values, aliasMap);
      const fiscalMonth = mapped.fiscalMonth ?? opts.fallbackFiscalMonth;
      const isCompliant = classifyLine(metric.code, mapped.fields, mapped.offset, mapped.hasOffset, exportKind);
      if (mapped.shiftedOffset) shiftedRows += 1;
      const base = lineKeyBase(metric.code, fiscalMonth, mapped.fields);
      const occurrence = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, occurrence);
      const poNumber = mapped.fields.poNumber ?? null;

      lines.push({
        metricId: metric.id,
        metricCode: metric.code,
        lineKey: hashKey(base, occurrence),
        fiscalMonth,
        isCompliant,
        offsetAmount: mapped.offset,
        fields: mapped.fields,
        po: poNumber
          ? {
              poNumber,
              pVendor: mapped.po.pVendor ?? null,
              mVendor: mapped.po.mVendor ?? null,
              mVendorName: mapped.po.mVendorName ?? null,
              dept: mapped.po.dept ?? null,
              dcNumber: mapped.fields.dcNumber ?? null,
              poCreateDate: mapped.fields.poCreateDate ?? null,
            }
          : null,
        raw: mapped.raw,
        sourceSheet: sheet.name,
        sourceRow: row.rowNumber,
        ...(outOfPeriod ? { updateOnly: true } : {}),
      });
      if (!outOfPeriod) fiscalMonths[fiscalMonth] = (fiscalMonths[fiscalMonth] ?? 0) + 1;
      preview.total += 1;
      if (!isCompliant) preview.nonCompliant += 1;
      preview.offset += mapped.offset;
    }
    preview.offset = Math.round(preview.offset * 100) / 100;
    metrics.push(preview);
    if (outOfPeriod) {
      warnings.push(`${metric.name} belongs to the ${periodLabel(periodOfMetric(metric.code))} import: its lines only update ones already imported, and no new lines are added.`);
    }
  }

  // SPM's summary download (…_SUM_…) has THD's totals but no PO lines. Each metric with offsets
  // becomes one non-compliant line without a PO so the month's offsets count; a detail export for
  // the same metric and month replaces it (see persistImport).
  const summaryOnly = !metrics.length && !emptySheets.length && summary.some((s) => s.mVendor === null);
  if (summaryOnly) {
    exportKind = "NON_COMPLIANT";
    const fiscalMonth = opts.fallbackFiscalMonth;
    for (const s of summary) {
      const metric = program.metrics.find((m) => m.id === s.metricId);
      if (s.mVendor !== null || !metric || !s.offsetsPreDispute) continue;
      const offset = Math.round(s.offsetsPreDispute * 100) / 100;
      const outOfPeriod = opts.period !== undefined && periodOfMetric(metric.code) !== opts.period;
      lines.push({
        metricId: metric.id,
        metricCode: metric.code,
        lineKey: hashKey(`${metric.code}|${fiscalMonth}|THD_SUMMARY`, 1),
        fiscalMonth,
        isCompliant: false,
        offsetAmount: offset,
        fields: { spmStatus: s.programStatus },
        po: null,
        raw: {
          Source: "THD Summary totals (summary-only export, no PO detail)",
          Metric: s.metricLabel,
          "Program Status": s.programStatus,
          "Non-Compliant Lines": s.nonCompliantLines,
          "Offsets Pre-Dispute": s.offsetsPreDispute,
          "Offsets Post-Dispute": s.offsetsPostDispute,
        },
        sourceSheet: SUMMARY_SHEET,
        sourceRow: 0,
        ...(outOfPeriod ? { updateOnly: true } : {}),
      });
      if (!outOfPeriod) fiscalMonths[fiscalMonth] = (fiscalMonths[fiscalMonth] ?? 0) + 1;
      metrics.push({ metricId: metric.id, code: metric.code, name: metric.name, sheet: SUMMARY_SHEET, total: 1, nonCompliant: 1, offset, unmappedHeaders: [], ...(outOfPeriod ? { outOfPeriod } : {}) });
    }
    warnings.push(
      "Summary-only export: it has THD's totals but no PO lines. Each metric with offsets is recorded as one line without a PO; importing the detail export for the same month replaces it.",
    );
  }

  if (exportKind === "UNKNOWN") {
    warnings.push("Could not tell from the filename whether this is an ALL_RESULTS or NON_COMPLIANT export; compliance % will not be calculated from it.");
  }
  if (opts.expectedFiscalMonth) {
    const other = Object.keys(fiscalMonths).map(Number).filter((fm) => fm !== opts.expectedFiscalMonth);
    if (other.length) warnings.push(`File contains lines for fiscal month(s) ${other.join(", ")}; this import expects fiscal month ${opts.expectedFiscalMonth}.`);
  }
  if (shiftedRows) {
    warnings.push(`${shiftedRows} row(s) had the offset under "Department #" (THD export column shift); the offset was read from that column.`);
  }
  // Reconcile offsets against THD's P-Vendor totals. Line counts are not compared: THD counts
  // Fill Rate in units and On Time in shipments, so they rarely match the detail rows.
  for (const s of summary) {
    if (s.mVendor !== null || s.offsetsPreDispute == null) continue;
    const m = metrics.find((p) => p.metricId === s.metricId);
    if (!m) continue;
    if (Math.abs(s.offsetsPreDispute - m.offset) > 0.01) {
      warnings.push(`${m.name}: THD summary shows $${s.offsetsPreDispute.toFixed(2)} pre-dispute offsets; the detail rows total $${m.offset.toFixed(2)}.`);
    }
  }
  if (!lines.length) warnings.push(summaryOnly ? "THD's summary shows no offsets, so there is nothing to import." : "No data rows were found in this file.");

  return { programId: program.id, programCode: program.code, exportKind, fiscalMonths, metrics, emptySheets, summary, lines, warnings };
}

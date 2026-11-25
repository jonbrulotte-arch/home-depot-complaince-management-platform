import type { DisputeStatus } from "@prisma/client";

// Reports & Insights › Cancellations: the financial impact of cancelled orders, one row per cancelled
// PO and SKU, from three sources tied together by PO number (without leading zeros) and SKU:
// - POM (THD's Purchase Order Management export): cancelled SKU lines and POs, with the units and
//   value (adjusted order quantity × unit cost) cancelled;
// - THD's compliance data: Fill Rate violations (the charges for what wasn't shipped), their offsets,
//   disputes and what was recovered, with the review's team and root cause;
// - the Issue Log: issues in the Order cancellation and Line cancellation categories (their status,
//   team and estimated fine), attached to every row of their POs.
// Pure (unit-tested); loading is in cancellations-data.ts.

export type CancelSource = "pom" | "compliance" | "issue";
export const CANCEL_SOURCE_LABELS: Record<CancelSource, string> = { pom: "POM", compliance: "THD charge (Fill Rate)", issue: "Issue Log" };

export interface CancelPomLine {
  poNumber: string;
  poStatus: string;
  /** YYYY-MM-DD */
  poCreateDate: string | null;
  month: number | null;
  destination: string | null;
  thdSku: string | null;
  partNumber: string | null;
  description: string | null;
  units: number;
  unitCost: number | null;
  /** The whole PO is cancelled, not just the SKU */
  wholePo: boolean;
  /** POM's vendor number and PO reason code (THD's order type), to tell order streams apart */
  vendorNumber?: string | null;
  reasonCode?: string | null;
}

export interface CancelChargeLine {
  id: string;
  month: number;
  poNumber: string | null;
  programCode: string;
  programName: string;
  dcNumber: string | null;
  sku: string | null;
  vendorSku: string | null;
  description: string | null;
  offset: number;
  team: string | null;
  rootCause: string | null;
  dispute: { status: DisputeStatus; recovered: number | null } | null;
}

export interface CancelIssue {
  id: string;
  number: number;
  title: string;
  category: string;
  status: string;
  team: string | null;
  month: number;
  estimatedFine: number | null;
  /** The issue's POs (as typed) and each PO's own estimate */
  pos: { poNumber: string; estimatedFine: number | null }[];
}

export interface CancelRow {
  key: string;
  poNumber: string;
  /** The month the row counts in: the PO's create month (POM), else THD's charge's report month, else the issue's */
  month: number | null;
  programCode: string | null;
  programName: string | null;
  destination: string | null;
  thdSku: string | null;
  ourSku: string | null;
  description: string | null;
  sources: CancelSource[];
  wholePo: boolean;
  /** POM */
  pomStatus: string | null;
  vendorNumber: string | null;
  /** POM's PO reason code */
  reasonCode: string | null;
  units: number;
  unitCost: number | null;
  /** Order value cancelled: units × unit cost */
  value: number;
  /** THD's Fill Rate charges */
  offsets: number;
  disputed: boolean;
  disputeStatus: DisputeStatus | null;
  recovered: number;
  net: number;
  team: string | null;
  rootCause: string | null;
  issues: { id: string; number: number; title: string; category: string; status: string }[];
  /** Estimated maximum fine from the Issue Log (the PO's own estimate, else the issue's, once per PO) */
  estimatedFine: number;
}

const bare = (po: string) => po.trim().toUpperCase().replace(/^0+(?=\d)/, "");
const skuKey = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/^0+(?=\d)/, "");
const round = (n: number) => Math.round(n * 100) / 100;
const WON: DisputeStatus[] = ["APPROVED", "PARTIAL"];

/** One row per cancelled PO and SKU, merged from POM, THD's Fill Rate charges and the Issue Log */
export function buildCancellations(input: { pom: CancelPomLine[]; charges: CancelChargeLine[]; issues: CancelIssue[] }): CancelRow[] {
  const rows = new Map<string, CancelRow>();
  const blank = (po: string): CancelRow => ({
    key: "",
    poNumber: po,
    month: null,
    programCode: null,
    programName: null,
    destination: null,
    thdSku: null,
    ourSku: null,
    description: null,
    sources: [],
    wholePo: false,
    pomStatus: null,
    vendorNumber: null,
    reasonCode: null,
    units: 0,
    unitCost: null,
    value: 0,
    offsets: 0,
    disputed: false,
    disputeStatus: null,
    recovered: 0,
    net: 0,
    team: null,
    rootCause: null,
    issues: [],
    estimatedFine: 0,
  });
  // POM lines, keyed by PO and THD's SKU (our SKU as a second key)
  const byOurSku = new Map<string, string>();
  for (const p of input.pom) {
    const key = `${bare(p.poNumber)}|${skuKey(p.thdSku) || `our:${skuKey(p.partNumber)}`}`;
    const r = rows.get(key) ?? { ...blank(p.poNumber), key };
    Object.assign(r, {
      month: r.month ?? p.month,
      destination: r.destination ?? p.destination,
      thdSku: p.thdSku,
      ourSku: p.partNumber,
      description: p.description,
      wholePo: p.wholePo,
      pomStatus: p.poStatus,
      vendorNumber: p.vendorNumber ?? null,
      reasonCode: p.reasonCode ?? null,
      units: r.units + p.units,
      unitCost: p.unitCost,
      value: round(r.value + p.units * (p.unitCost ?? 0)),
    });
    if (!r.sources.includes("pom")) r.sources.push("pom");
    rows.set(key, r);
    if (p.partNumber) byOurSku.set(`${bare(p.poNumber)}|${skuKey(p.partNumber)}`, key);
  }
  // THD's Fill Rate charges: onto the POM row of the same PO and SKU, else a row of their own
  for (const c of input.charges) {
    const po = c.poNumber ?? "(no PO)";
    const key = (c.sku && rows.has(`${bare(po)}|${skuKey(c.sku)}`) ? `${bare(po)}|${skuKey(c.sku)}` : null) ?? (c.vendorSku ? byOurSku.get(`${bare(po)}|${skuKey(c.vendorSku)}`) : undefined) ?? `${bare(po)}|${skuKey(c.sku) || `our:${skuKey(c.vendorSku)}` || c.id}`;
    const r = rows.get(key) ?? { ...blank(po), key };
    const recovered = c.dispute && WON.includes(c.dispute.status) ? (c.dispute.recovered ?? 0) : 0;
    Object.assign(r, {
      // The PO's create month (POM) wins, so the tab reconciles to POM for any time frame; a charge
      // POM doesn't have counts in its report month
      month: r.month ?? c.month,
      programCode: c.programCode,
      programName: c.programName,
      destination: r.destination ?? c.dcNumber,
      thdSku: r.thdSku ?? c.sku,
      ourSku: r.ourSku ?? c.vendorSku,
      description: r.description ?? c.description,
      offsets: round(r.offsets + c.offset),
      recovered: round(r.recovered + recovered),
      disputed: r.disputed || Boolean(c.dispute),
      disputeStatus: c.dispute?.status ?? r.disputeStatus,
      team: r.team ?? c.team,
      rootCause: r.rootCause ?? c.rootCause,
    });
    if (!r.sources.includes("compliance")) r.sources.push("compliance");
    rows.set(key, r);
  }
  // Issue Log cancellations: on every row of their POs, else a PO-level row
  for (const i of input.issues) {
    for (const p of i.pos) {
      const prefix = `${bare(p.poNumber)}|`;
      let targets = [...rows.values()].filter((r) => r.key.startsWith(prefix));
      if (!targets.length) {
        const r: CancelRow = { ...blank(p.poNumber), key: `${prefix}issue`, month: i.month, wholePo: true };
        rows.set(r.key, r);
        targets = [r];
      }
      // The PO's estimate (else the issue's, shared across its POs) counted once per PO
      const fine = p.estimatedFine ?? (i.estimatedFine !== null && !i.pos.some((x) => x.estimatedFine !== null) ? i.estimatedFine / i.pos.length : 0);
      targets.forEach((r, n) => {
        if (!r.issues.some((x) => x.id === i.id)) r.issues.push({ id: i.id, number: i.number, title: i.title, category: i.category, status: i.status });
        if (!r.sources.includes("issue")) r.sources.push("issue");
        r.team = r.team ?? i.team;
        if (n === 0) r.estimatedFine = round(r.estimatedFine + fine);
      });
    }
  }
  for (const r of rows.values()) r.net = round(r.offsets - r.recovered);
  return [...rows.values()].sort((a, b) => (b.month ?? 0) - (a.month ?? 0) || b.offsets + b.value - (a.offsets + a.value) || a.poNumber.localeCompare(b.poNumber));
}

export interface CancelFilters {
  /** Fiscal months in the time frame; rows without a month only show with no time frame limit */
  months?: number[];
  /** Also rows after this month (a recent time frame runs on past THD's latest data: POM and the Issue Log are newer) */
  openAfter?: number;
  program?: string;
  /** pom | compliance | issue */
  source?: string;
  team?: string;
  /** A destination Store/DC number */
  dc?: string;
  /** THD's SKU or our SKU (contains) */
  sku?: string;
  /** "po" (whole PO cancelled) or "sku" */
  scope?: string;
  /** "none" (not disputed), "open" (disputed, no decision), "won", "lost" */
  dispute?: string;
  /** POM vendor number */
  vendor?: string;
  /** POM PO reason code */
  reason?: string;
  /** PO number, SKU, description, root cause or issue title (contains) */
  q?: string;
}

/** The time frame's months for Cancellations: a recent frame (last N months, fiscal year to date, all time) runs on past THD's latest data */
export function cancelFrame(frame: { key: string; months: number[]; to: number }): Pick<CancelFilters, "months" | "openAfter"> {
  if (frame.key === "all") return {};
  return { months: frame.months, openAfter: ["custom", "pfy"].includes(frame.key) ? undefined : frame.to };
}

export function filterCancellations(rows: CancelRow[], f: CancelFilters): CancelRow[] {
  const months = f.months ? new Set(f.months) : null;
  const q = f.q?.trim().toUpperCase();
  const sku = f.sku?.trim().toUpperCase();
  return rows.filter((r) => {
    if (months && (r.month === null || !(months.has(r.month) || (f.openAfter !== undefined && r.month > f.openAfter)))) return false;
    if (f.program && r.programCode !== f.program) return false;
    if (f.source && !r.sources.includes(f.source as CancelSource)) return false;
    if (f.team && (r.team ?? "Not assigned") !== f.team) return false;
    if (f.dc && skuKey(r.destination) !== skuKey(f.dc)) return false;
    if (sku && ![r.thdSku, r.ourSku].some((s) => s?.toUpperCase().includes(sku))) return false;
    if (f.vendor && r.vendorNumber !== f.vendor) return false;
    if (f.reason && r.reasonCode !== f.reason) return false;
    if (f.scope === "po" && !r.wholePo) return false;
    if (f.scope === "sku" && r.wholePo) return false;
    if (f.dispute === "none" && r.disputed) return false;
    if (f.dispute === "open" && !(r.disputed && r.disputeStatus && !["APPROVED", "PARTIAL", "DENIED", "WITHDRAWN"].includes(r.disputeStatus))) return false;
    if (f.dispute === "won" && !(r.disputeStatus && WON.includes(r.disputeStatus))) return false;
    if (f.dispute === "lost" && r.disputeStatus !== "DENIED") return false;
    if (q && ![r.poNumber, r.thdSku, r.ourSku, r.description, r.rootCause, ...r.issues.map((i) => `ISS-${String(i.number).padStart(4, "0")} ${i.title}`)].some((s) => s?.toUpperCase().includes(q))) return false;
    return true;
  });
}

export interface CancelTotals {
  rows: number;
  pos: number;
  units: number;
  value: number;
  offsets: number;
  recovered: number;
  net: number;
  estimatedFines: number;
  /** Rows THD charged for */
  charged: number;
  disputed: number;
}

export function cancelTotals(rows: CancelRow[]): CancelTotals {
  return {
    rows: rows.length,
    pos: new Set(rows.map((r) => bare(r.poNumber))).size,
    units: rows.reduce((s, r) => s + r.units, 0),
    value: round(rows.reduce((s, r) => s + r.value, 0)),
    offsets: round(rows.reduce((s, r) => s + r.offsets, 0)),
    recovered: round(rows.reduce((s, r) => s + r.recovered, 0)),
    net: round(rows.reduce((s, r) => s + r.net, 0)),
    estimatedFines: round(rows.reduce((s, r) => s + r.estimatedFine, 0)),
    charged: rows.filter((r) => r.offsets > 0).length,
    disputed: rows.filter((r) => r.disputed).length,
  };
}

export interface CancelGroup extends CancelTotals {
  key: string;
  label: string;
}

/** Totals by a key (month, destination, SKU, team, root cause, program, source…), largest impact first */
export function groupCancellations(rows: CancelRow[], key: (r: CancelRow) => string | string[] | null, label: (k: string) => string = (k) => k, order: "impact" | "key" = "impact"): CancelGroup[] {
  const groups = new Map<string, CancelRow[]>();
  for (const r of rows) {
    const ks = key(r);
    for (const k of Array.isArray(ks) ? ks : [ks ?? "—"]) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out = [...groups].map(([k, rs]) => ({ key: k, label: label(k), ...cancelTotals(rs) }));
  return order === "key" ? out.sort((a, b) => a.key.localeCompare(b.key)) : out.sort((a, b) => b.net + b.value - (a.net + a.value) || a.label.localeCompare(b.label));
}

/** The options the tab's filters offer, from the rows */
export function cancelFilterOptions(rows: CancelRow[]) {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    teams: uniq(rows.map((r) => r.team ?? "Not assigned")),
    dcs: uniq(rows.map((r) => r.destination)),
    vendors: uniq(rows.map((r) => r.vendorNumber)),
    reasons: uniq(rows.map((r) => r.reasonCode)),
  };
}

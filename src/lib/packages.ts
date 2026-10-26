import { prisma } from "@/lib/prisma";
import { fiscalLabel } from "@/lib/fiscal";
import { TEAM_INFLUENCES } from "@/lib/line-fields";
import { getPeriodField, linesInPeriod } from "@/lib/periods";
import { lineCountKey } from "@/lib/scorecard-rules";
import { periodLabel, periodOfMetric } from "@/lib/shipment-ranges";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";

// Chargeback packages: the Package ID entered on a report for one program's compliance period
// covers that period's lines with an offset. Finance finds the ID on THD's remittance and looks
// the package up in PO Lookup (/po-lookup/package/<id>), with an Excel export.

const DECISIONS: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DISPUTABLE: "Disputable",
  NOT_DISPUTABLE: "Not disputable",
  NEEDS_RESEARCH: "Needs research",
  RESOLVED: "Cancelled / Resolved",
};
const round = (n: number) => Math.round(n * 100) / 100;

/** A report's Package IDs, keyed by program and compliance period (`lineCountKey`). */
export async function getPackageIds(reportId: string): Promise<Record<string, string>> {
  const rows = await prisma.chargebackPackage.findMany({ where: { reportId }, select: { programId: true, period: true, packageId: true } });
  return Object.fromEntries(rows.map((r) => [lineCountKey(r.programId, r.period), r.packageId]));
}

/** Package IDs starting with the search text (any case), for PO Lookup */
export async function findPackageIds(q: string): Promise<string[]> {
  const rows = await prisma.chargebackPackage.findMany({
    where: { packageId: { startsWith: q, mode: "insensitive" } },
    select: { packageId: true },
    orderBy: { packageId: "asc" },
    take: 20,
  });
  return [...new Set(rows.map((r) => r.packageId))];
}

export interface PackageLine {
  lineId: string;
  reportId: string;
  report: string;
  reportPeriod: string;
  program: string;
  compliancePeriod: string;
  metric: string;
  poNumber: string | null;
  poRecordId: string | null;
  poCreateDate: string | null;
  sku: string | null;
  description: string | null;
  site: string | null;
  fiscalMonth: string;
  offset: number;
  decision: string;
  team: string | null;
  rootCause: string | null;
  disputeStatus: string | null;
  amountDisputed: number | null;
  recovered: number | null;
  /** What the chargeback comes to after any recovered amount */
  net: number;
}

/** Every line with an offset in the slots carrying this Package ID (matched ignoring case), or null if none does. */
export async function packageReport(packageId: string) {
  const slots = await prisma.chargebackPackage.findMany({
    where: { packageId: { equals: packageId, mode: "insensitive" } },
    include: {
      report: { select: { id: true, title: true, status: true, period: { select: { fiscalMonth: true } } } },
      program: { select: { name: true, sortOrder: true, metrics: { select: { id: true, code: true } } } },
    },
  });
  if (!slots.length) return null;
  const field = await getPeriodField();
  const lines: PackageLine[] = [];
  for (const slot of slots) {
    const metricIds = slot.program.metrics.filter((m) => periodOfMetric(m.code) === slot.period).map((m) => m.id);
    const rows = await prisma.complianceLine.findMany({
      where: { ...linesInPeriod(field, slot.report.period.fiscalMonth), metricId: { in: metricIds }, offsetAmount: { gt: 0 } },
      include: {
        metric: { select: { name: true, sortOrder: true } },
        review: { select: { disposition: true, teamInfluence: true, rootCause: true } },
        dispute: { select: { status: true, amountDisputed: true, amountRecovered: true } },
      },
      orderBy: [{ metric: { sortOrder: "asc" } }, { poNumber: "asc" }],
    });
    for (const l of rows) {
      const offset = Number(l.offsetAmount);
      const dispute = l.dispute && l.dispute.status !== "WITHDRAWN" ? l.dispute : null;
      const recovered = dispute?.amountRecovered == null ? null : Number(dispute.amountRecovered);
      lines.push({
        lineId: l.id,
        reportId: slot.report.id,
        report: slot.report.title,
        reportPeriod: fiscalLabel(slot.report.period.fiscalMonth),
        program: slot.program.name,
        compliancePeriod: periodLabel(slot.period),
        metric: l.metric.name,
        poNumber: l.poNumber,
        poRecordId: l.poRecordId,
        poCreateDate: l.poCreateDate?.toISOString() ?? null,
        sku: l.sku,
        description: l.skuDescription,
        site: l.dcNumber,
        fiscalMonth: fiscalLabel(l.fiscalMonth),
        offset,
        decision: DECISIONS[l.review?.disposition ?? "PENDING"] ?? "Pending",
        team: l.review?.teamInfluence ? TEAM_INFLUENCES[l.review.teamInfluence as keyof typeof TEAM_INFLUENCES] ?? l.review.teamInfluence : null,
        rootCause: l.review?.rootCause ?? null,
        disputeStatus: dispute ? DISPUTE_STATUS_LABELS[dispute.status] : null,
        amountDisputed: dispute ? Number(dispute.amountDisputed) : null,
        recovered,
        net: round(Math.max(0, offset - (recovered ?? 0))),
      });
    }
  }
  const sum = (f: (l: PackageLine) => number) => round(lines.reduce((s, l) => s + f(l), 0));
  return {
    packageId: slots[0].packageId,
    slots: slots
      .sort((a, b) => b.report.period.fiscalMonth - a.report.period.fiscalMonth || a.program.sortOrder - b.program.sortOrder)
      .map((s) => ({ reportId: s.report.id, report: s.report.title, program: s.program.name, compliancePeriod: periodLabel(s.period) })),
    lines,
    totals: {
      lines: lines.length,
      pos: new Set(lines.map((l) => l.poRecordId ?? l.poNumber ?? l.lineId)).size,
      offset: sum((l) => l.offset),
      recovered: sum((l) => l.recovered ?? 0),
      net: sum((l) => l.net),
    },
  };
}

export type PackageReport = NonNullable<Awaited<ReturnType<typeof packageReport>>>;

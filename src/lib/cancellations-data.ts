import { vendorProgramMap } from "@/lib/vendor-numbers";
import { prisma } from "@/lib/prisma";
import { calendarToFiscal } from "@/lib/fiscal";
import { getPeriodField } from "@/lib/periods";
import { teamNames } from "@/lib/teams";
import { ORDER_CANCELLATION } from "@/lib/issues";
import { buildCancellations, type CancelChargeLine, type CancelPomLine, type CancelRow } from "@/lib/cancellations";

// Loads the Cancellations analysis (Reports & Insights): POM's cancelled lines, THD's Fill Rate
// charges and the Issue Log's cancellation issues, merged by cancellations.ts.

export const CANCELLATION_CATEGORIES = [ORDER_CANCELLATION, "Line cancellation"];

const fiscalOf = (d: Date) => calendarToFiscal(d.getUTCFullYear(), d.getUTCMonth());

export async function loadCancellations(): Promise<CancelRow[]> {
  const field = await getPeriodField();
  const [pomLines, chargeRows, issues, names, programs] = await Promise.all([
    // POM SKU lines cancelled, or on a cancelled PO
    prisma.pomPoLine.findMany({
      where: { OR: [{ status: { startsWith: "cancel", mode: "insensitive" } }, { po: { status: { startsWith: "cancel", mode: "insensitive" } } }] },
      include: { po: { select: { status: true, poCreateDate: true, destinationDc: true, finalRecvLocation: true, vendorNumber: true, reasonCode: true } } },
    }),
    // THD's Fill Rate charges: the cost of what wasn't shipped (Cancelled / Resolved lines aren't violations)
    prisma.complianceLine.findMany({
      where: { isCompliant: false, metric: { code: "FILL_RATE" }, NOT: { review: { disposition: "RESOLVED" } } },
      select: {
        id: true,
        fiscalMonth: true,
        receivedMonth: true,
        poNumber: true,
        dcNumber: true,
        sku: true,
        vendorSku: true,
        skuDescription: true,
        offsetAmount: true,
        metric: { select: { program: { select: { code: true, name: true } } } },
        review: { select: { teamInfluence: true, rootCause: true } },
        dispute: { select: { status: true, amountRecovered: true } },
      },
    }),
    prisma.issue.findMany({
      where: { category: { in: CANCELLATION_CATEGORIES } },
      select: { id: true, number: true, title: true, category: true, status: true, team: true, issueDate: true, estimatedFine: true, program: { select: { code: true, name: true } }, pos: { select: { poNumber: true, estimatedFine: true } } },
    }),
    teamNames(),
    prisma.program.findMany({ select: { code: true, name: true, vendorNumbers: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const pom: CancelPomLine[] = pomLines.map((l) => {
    const wholePo = /^cancel/i.test(l.po.status);
    const ordered = l.adjOrderQty ?? l.orderQty ?? 0;
    return {
      poNumber: l.poNumber,
      poStatus: l.po.status,
      poCreateDate: l.po.poCreateDate ? l.po.poCreateDate.toISOString().slice(0, 10) : null,
      month: l.po.poCreateDate ? fiscalOf(l.po.poCreateDate) : null,
      destination: l.po.finalRecvLocation ?? l.po.destinationDc,
      thdSku: l.thdSku,
      partNumber: l.partNumber,
      description: l.description,
      units: Math.max(0, ordered - (l.shippedQty ?? 0)),
      unitCost: l.unitCost === null ? null : l.unitCost.toNumber(),
      wholePo,
      vendorNumber: l.po.vendorNumber,
      reasonCode: l.po.reasonCode,
    };
  });
  const charges: CancelChargeLine[] = chargeRows.map((c) => ({
    id: c.id,
    month: field === "fiscalMonth" ? c.fiscalMonth : c.receivedMonth,
    poNumber: c.poNumber,
    programCode: c.metric.program.code,
    programName: c.metric.program.name,
    dcNumber: c.dcNumber,
    sku: c.sku,
    vendorSku: c.vendorSku,
    description: c.skuDescription,
    offset: Number(c.offsetAmount),
    team: c.review?.teamInfluence ? (names[c.review.teamInfluence] ?? c.review.teamInfluence) : null,
    rootCause: c.review?.rootCause ?? null,
    dispute: c.dispute && c.dispute.status !== "WITHDRAWN" ? { status: c.dispute.status, recovered: c.dispute.amountRecovered === null ? null : Number(c.dispute.amountRecovered) } : null,
  }));
  return buildCancellations({
    pom,
    charges,
    vendorPrograms: vendorProgramMap(programs),
    issues: issues.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      category: i.category,
      status: i.status,
      team: i.team ? (names[i.team] ?? i.team) : null,
      month: fiscalOf(i.issueDate),
      estimatedFine: i.estimatedFine,
      programCode: i.program?.code ?? null,
      programName: i.program?.name ?? null,
      pos: i.pos.map((p) => ({ poNumber: p.poNumber, estimatedFine: p.estimatedFine })),
    })),
  });
}

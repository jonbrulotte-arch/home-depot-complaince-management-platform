import { prisma } from "@/lib/prisma";
import { getPeriodField, linesInPeriod } from "@/lib/periods";
import { lineItem } from "@/lib/issues";
import { DISPUTE_STATUS_LABELS, type ChecklistItem } from "@/lib/disputes";
import { teamNames } from "@/lib/teams";
import type { DisputeEmailItem } from "@/lib/dispute-email";

// Loads a report's selected disputes for the dispute report PDF and Send Email.

export async function loadDisputesForEmail(reportId: string, ids: string[]) {
  const report = await prisma.complianceReport.findUnique({ where: { id: reportId }, include: { period: true, programs: true } });
  if (!report) return null;
  const found = await prisma.dispute.findMany({
    where: {
      id: { in: [...new Set(ids)] },
      // Only this report's disputes, as its Disputes page lists them
      line: { ...linesInPeriod(await getPeriodField(), report.period.fiscalMonth), metric: { programId: { in: report.programs.map((p) => p.programId) } } },
    },
    include: { line: { include: { metric: { include: { program: true } }, review: true } }, reasonCode: true },
  });
  const byId = new Map(found.map((d) => [d.id, d]));
  const disputes = ids.map((id) => byId.get(id)).filter((d): d is (typeof found)[number] => Boolean(d));
  return { report, disputes, teams: await teamNames() };
}

export type LoadedDisputes = NonNullable<Awaited<ReturnType<typeof loadDisputesForEmail>>>;
export type LoadedDispute = LoadedDisputes["disputes"][number];

export function checklistOf(d: LoadedDispute): ChecklistItem[] {
  return Array.isArray(d.checklist) ? (d.checklist as unknown as ChecklistItem[]) : [];
}

/** What the email draft needs about a dispute */
export function emailItem(d: LoadedDispute): DisputeEmailItem {
  return {
    poNumber: d.line.poNumber,
    program: d.line.metric.program.name,
    metric: d.line.metric.name,
    amountDisputed: Number(d.amountDisputed),
    status: d.status,
    statusLabel: DISPUTE_STATUS_LABELS[d.status],
    reasonCode: d.reasonCode?.code ?? null,
    requiredDocs: d.reasonCode?.requiredDocs ?? null,
    openItems: checklistOf(d).filter((c) => !c.done).length,
    item: lineItem(d.line).primary === "—" ? null : lineItem(d.line).primary,
    decision: [d.decisionCode, d.amountRecovered != null && Number(d.amountRecovered) > 0 ? `${Number(d.amountRecovered).toLocaleString("en-US", { style: "currency", currency: "USD" })} recovered` : null].filter(Boolean).join(", ") || null,
  };
}

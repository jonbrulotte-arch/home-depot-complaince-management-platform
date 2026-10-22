import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildChecklist, defaultDisputeWindow, draftSupplierComment } from "@/lib/disputes";

/** Fills in the period's dispute window from THD's calendar rule when it has not been set. */
export async function ensureDisputeWindow(periodId: string) {
  const period = await prisma.compliancePeriod.findUniqueOrThrow({ where: { id: periodId } });
  if (period.disputeOpen && period.disputeClose) return period;
  const { open, close } = defaultDisputeWindow(period.fiscalMonth);
  return prisma.compliancePeriod.update({
    where: { id: periodId },
    data: { disputeOpen: period.disputeOpen ?? open, disputeClose: period.disputeClose ?? close },
  });
}

/**
 * Brings a report's disputes in line with its review decisions: creates a dispute for each
 * line marked Disputable, reopens withdrawn ones that are Disputable again, and withdraws
 * unsubmitted disputes whose line is no longer Disputable.
 */
export async function syncDisputes(reportId: string, userId: string | null): Promise<{ created: number; reopened: number; withdrawn: number }> {
  const report = await prisma.complianceReport.findUniqueOrThrow({ where: { id: reportId }, include: { programs: true } });
  const period = await ensureDisputeWindow(report.periodId);

  const lines = await prisma.complianceLine.findMany({
    where: {
      fiscalMonth: period.fiscalMonth,
      isCompliant: false,
      metric: { programId: { in: report.programs.map((p) => p.programId) } },
      OR: [{ review: { disposition: "DISPUTABLE" } }, { dispute: { isNot: null } }],
    },
    include: { metric: true, review: true, dispute: true },
  });
  const reasonCodes = new Map(
    (await prisma.disputeReasonCode.findMany({ where: { id: { in: lines.flatMap((l) => (l.review?.reasonCodeId ? [l.review.reasonCodeId] : [])) } } })).map((r) => [r.id, r]),
  );

  let created = 0;
  let reopened = 0;
  let withdrawn = 0;
  await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      const disputable = line.review?.disposition === "DISPUTABLE";
      const reason = line.review?.reasonCodeId ? reasonCodes.get(line.review.reasonCodeId) ?? null : null;

      if (disputable && !line.dispute) {
        await tx.dispute.create({
          data: {
            lineId: line.id,
            reasonCodeId: reason?.id ?? null,
            amountDisputed: line.offsetAmount,
            dueDate: period.disputeClose,
            checklist: buildChecklist(reason) as unknown as Prisma.InputJsonArray,
            supplierComment: draftSupplierComment({ poNumber: line.poNumber, metricName: line.metric.name }, reason?.code ?? null, line.review?.notes ?? null),
            events: { create: { type: "CREATED", body: "Created from the line review decision", toStatus: "PREPARING", userId } },
          },
        });
        created += 1;
      } else if (disputable && line.dispute?.status === "WITHDRAWN") {
        await tx.dispute.update({
          where: { id: line.dispute.id },
          data: { status: "PREPARING", events: { create: { type: "STATUS", fromStatus: "WITHDRAWN", toStatus: "PREPARING", body: "Line marked Disputable again", userId } } },
        });
        reopened += 1;
      } else if (!disputable && line.dispute && (line.dispute.status === "PREPARING" || line.dispute.status === "READY")) {
        await tx.dispute.update({
          where: { id: line.dispute.id },
          data: {
            status: "WITHDRAWN",
            events: { create: { type: "STATUS", fromStatus: line.dispute.status, toStatus: "WITHDRAWN", body: "Line is no longer marked Disputable", userId } },
          },
        });
        withdrawn += 1;
      }
    }
  });
  return { created, reopened, withdrawn };
}

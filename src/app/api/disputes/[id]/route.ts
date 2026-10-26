import { NextResponse } from "next/server";
import { z } from "zod";
import type { DisputeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { buildChecklist, canTransition, DISPUTE_STATUS_LABELS, type ChecklistItem } from "@/lib/disputes";

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const STATUSES = ["PREPARING", "READY", "SUBMITTED", "APPROVED", "PARTIAL", "DENIED", "WITHDRAWN"] as const;

const patchSchema = z.object({
  reasonCodeId: z.string().trim().min(1).nullable().optional(),
  amountDisputed: z.number().min(0).max(10_000_000).optional(),
  dueDate: isoDate.nullable().optional(),
  checklist: z.array(z.object({ label: z.string().trim().min(1).max(500), done: z.boolean() })).max(50).optional(),
  supplierComment: z.string().trim().max(4000).nullable().optional(),
  spmReference: z.string().trim().max(200).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  /** Submission or decision date, defaults to today */
  statusDate: isoDate.optional(),
  decisionCode: z.string().trim().max(100).nullable().optional(),
  decisionNotes: z.string().trim().max(4000).nullable().optional(),
  amountRecovered: z.number().min(0).max(10_000_000).nullable().optional(),
  /** Recorded on the timeline with the change */
  note: z.string().trim().max(4000).optional(),
});

export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  const input = body.data;

  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { line: { select: { metricId: true } }, reasonCode: true } });
  if (!dispute) return notFound("Dispute not found");

  const data: Prisma.DisputeUpdateInput = {};
  const events: Prisma.DisputeEventCreateWithoutDisputeInput[] = [];
  const user = { connect: { id: guard.user.id } };

  if (input.reasonCodeId !== undefined && input.reasonCodeId !== dispute.reasonCodeId) {
    const reason = input.reasonCodeId ? await prisma.disputeReasonCode.findFirst({ where: { id: input.reasonCodeId, metricId: dispute.line.metricId } }) : null;
    if (input.reasonCodeId && !reason) return badRequest("Dispute reason code does not apply to this metric");
    data.reasonCode = reason ? { connect: { id: reason.id } } : { disconnect: true };
    // Rebuild the checklist for the new reason unless work on the current one has started
    const checklist = dispute.checklist as unknown as ChecklistItem[];
    if (!input.checklist && !checklist.some((c) => c.done)) data.checklist = buildChecklist(reason) as unknown as Prisma.InputJsonArray;
    events.push({ type: "NOTE", body: `Reason code set to "${reason?.code ?? "none"}"`, user });
  }
  if (input.amountDisputed !== undefined) data.amountDisputed = input.amountDisputed;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
  if (input.checklist) data.checklist = input.checklist as unknown as Prisma.InputJsonArray;
  if (input.supplierComment !== undefined) data.supplierComment = input.supplierComment || null;
  if (input.spmReference !== undefined) data.spmReference = input.spmReference || null;
  if (input.decisionCode !== undefined) data.decisionCode = input.decisionCode || null;
  if (input.decisionNotes !== undefined) data.decisionNotes = input.decisionNotes || null;

  const to = input.status;
  if (to && to !== dispute.status) {
    if (!canTransition(dispute.status, to)) {
      return badRequest(`Cannot move a dispute from ${DISPUTE_STATUS_LABELS[dispute.status]} to ${DISPUTE_STATUS_LABELS[to]}`);
    }
    const when = input.statusDate ? new Date(`${input.statusDate}T00:00:00Z`) : new Date();
    const amountDisputed = input.amountDisputed ?? Number(dispute.amountDisputed);
    data.status = to;
    if (to === "SUBMITTED" && !dispute.submittedAt) data.submittedAt = when;
    if (to === "SUBMITTED" && isDecided(dispute.status)) {
      // Reopening a decision to correct it
      Object.assign(data, { decidedAt: null, amountRecovered: null });
    }
    if (to === "APPROVED" || to === "PARTIAL" || to === "DENIED") {
      let recovered = to === "APPROVED" ? (input.amountRecovered ?? amountDisputed) : to === "DENIED" ? 0 : input.amountRecovered;
      if (recovered == null) return badRequest("Enter the amount recovered for a partial approval");
      recovered = Math.min(recovered, amountDisputed);
      Object.assign(data, { decidedAt: when, amountRecovered: recovered, spmDecisionSeen: null });
    }
    events.push({ type: "STATUS", fromStatus: dispute.status, toStatus: to, body: input.note || null, user });
  } else if (input.note) {
    events.push({ type: "NOTE", body: input.note, user });
  }
  if (input.amountRecovered != null && !to && isDecided(dispute.status) && dispute.status !== "DENIED") {
    data.amountRecovered = Math.min(input.amountRecovered, Number(dispute.amountDisputed));
  }

  if (events.length) data.events = { create: events };
  const updated = await prisma.dispute.update({ where: { id }, data });
  await audit(guard.user.id, to ? "dispute.status" : "dispute.update", "Dispute", id, { ...input, from: dispute.status });
  return NextResponse.json({ id: updated.id, status: updated.status });
}

function isDecided(status: DisputeStatus) {
  return status === "APPROVED" || status === "PARTIAL" || status === "DENIED";
}

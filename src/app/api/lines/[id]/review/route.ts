import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isAssignableTeam } from "@/lib/teams";

const reviewSchema = z.object({
  disposition: z.enum(["PENDING", "ACCEPTED", "DISPUTABLE", "NOT_DISPUTABLE", "NEEDS_RESEARCH", "RESOLVED"]),
  // A team key (Admin › Teams): an active team, or the one the review already has
  teamInfluence: z.string().trim().max(64).nullable().optional(),
  reasonCodeId: z.string().trim().min(1).nullable().optional(),
  rootCause: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
  extraFields: z.record(z.string().trim().max(100), z.string().trim().max(2000)).optional(),
});

export async function PUT(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("lines.triage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, reviewSchema);
  if (body.error) return body.error;

  const line = await prisma.complianceLine.findUnique({ where: { id }, select: { id: true, metricId: true, review: { select: { teamInfluence: true } } } });
  if (!line) return notFound("Line not found");
  if (body.data.teamInfluence && !(await isAssignableTeam(body.data.teamInfluence, line.review?.teamInfluence))) return badRequest("Unknown or inactive team");
  const { reasonCodeId, ...rest } = body.data;
  if (reasonCodeId) {
    const code = await prisma.disputeReasonCode.findFirst({ where: { id: reasonCodeId, metricId: line.metricId } });
    if (!code) return badRequest("Dispute reason code does not apply to this metric");
  }

  const data = {
    ...rest,
    reasonCodeId: reasonCodeId ?? null,
    teamInfluence: rest.teamInfluence ?? null,
    rootCause: rest.rootCause || null,
    notes: rest.notes || null,
    reviewerId: guard.user.id,
    reviewedAt: new Date(),
  };
  const review = await prisma.lineReview.upsert({ where: { lineId: id }, update: data, create: { ...data, lineId: id } });
  await audit(guard.user.id, "line.review", "ComplianceLine", id, { disposition: review.disposition });
  return NextResponse.json({ review });
}

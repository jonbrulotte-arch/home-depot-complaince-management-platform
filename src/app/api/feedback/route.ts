import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { scorecardData } from "@/lib/scorecard-store";
import type { FeedbackItem } from "@/lib/feedback";

const schema = z.object({
  reportId: z.string().trim().min(1),
  lineId: z.string().trim().min(1),
  body: z.string().trim().min(1, "Feedback cannot be empty").max(5000),
});

/** Adds feedback to a violation of a published scorecard. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("feedback.submit");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { reportId, lineId } = body.data;

  const scorecard = await prisma.scorecard.findUnique({ where: { reportId }, include: { report: { select: { status: true } } } });
  if (!scorecard?.publishedAt || scorecard.report.status !== "PUBLISHED") return notFound("Feedback is only taken on published scorecards");
  if (!scorecardData(scorecard.data).violations.some((v) => v.lineId === lineId)) return badRequest("That line is not a violation on this scorecard");

  const created = await prisma.scorecardFeedback.create({ data: { reportId, lineId, body: body.data.body, authorId: guard.user.id } });
  await audit(guard.user.id, "feedback.create", "ScorecardFeedback", created.id, { reportId, lineId });
  const item: FeedbackItem = { id: created.id, lineId, body: created.body, authorId: guard.user.id, author: guard.user.name, createdAt: created.createdAt.toISOString() };
  return NextResponse.json(item, { status: 201 });
}

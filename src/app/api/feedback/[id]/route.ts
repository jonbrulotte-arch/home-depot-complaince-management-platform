import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Deletes feedback; people can delete their own, and user admins anyone's. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("feedback.submit");
  if (guard.error) return guard.error;
  const { id } = await params;
  const feedback = await prisma.scorecardFeedback.findUnique({ where: { id } });
  if (!feedback) return notFound("Feedback not found");
  if (feedback.authorId !== guard.user.id && !guard.user.permissions.has("admin.users")) {
    return NextResponse.json({ error: "You can only delete your own feedback" }, { status: 403 });
  }
  await prisma.scorecardFeedback.delete({ where: { id } });
  await audit(guard.user.id, "feedback.delete", "ScorecardFeedback", id, { reportId: feedback.reportId, lineId: feedback.lineId });
  return NextResponse.json({ ok: true });
}

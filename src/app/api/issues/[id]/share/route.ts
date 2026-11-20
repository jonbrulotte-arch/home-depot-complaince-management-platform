import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { issueLabel } from "@/lib/issues";
import { shareIssue } from "@/lib/issue-share";

/** Turns on the issue's public read-only link, or replaces it (the old link stops working). */
export async function POST(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const issue = await prisma.issue.findUnique({ where: { id }, select: { number: true, share: { select: { token: true } } } });
  if (!issue) return notFound("Issue not found");
  const token = await shareIssue(id, guard.user.id);
  await audit(guard.user.id, issue.share ? "issue.shareReset" : "issue.share", "Issue", id, { issue: issueLabel(issue.number) });
  return NextResponse.json({ token });
}

/** Turns the public link off. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const issue = await prisma.issue.findUnique({ where: { id }, select: { number: true } });
  if (!issue) return notFound("Issue not found");
  const { count } = await prisma.issueShare.deleteMany({ where: { issueId: id } });
  if (count) await audit(guard.user.id, "issue.unshare", "Issue", id, { issue: issueLabel(issue.number) });
  return NextResponse.json({ ok: true });
}

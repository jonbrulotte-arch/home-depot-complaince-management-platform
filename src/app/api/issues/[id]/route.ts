import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanPos, issueData, issueInput, issueLabel } from "@/lib/issues";

/** Saves an edited issue; its PO list is replaced by the one sent. */
export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, issueInput);
  if (body.error) return body.error;
  const pos = cleanPos(body.data.pos);
  if (pos.error) return badRequest(pos.error);
  const previous = await prisma.issue.findUnique({ where: { id }, select: { number: true, status: true, resolvedAt: true } });
  if (!previous) return notFound("Issue not found");
  if (body.data.programId && !(await prisma.program.findUnique({ where: { id: body.data.programId }, select: { id: true } }))) return badRequest("Unknown program");

  await prisma.$transaction([
    prisma.issuePo.deleteMany({ where: { issueId: id } }),
    prisma.issue.update({ where: { id }, data: { ...issueData(body.data, previous), updatedById: guard.user.id, pos: { create: pos.pos } } }),
  ]);
  await audit(guard.user.id, "issue.update", "Issue", id, {
    number: issueLabel(previous.number),
    ...(previous.status !== body.data.status ? { status: { from: previous.status, to: body.data.status } } : {}),
    pos: pos.pos.map((p) => p.poNumber),
  });
  return NextResponse.json({ ok: true });
}

/** Deletes an issue: whoever logged it, or a user admin. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const issue = await prisma.issue.findUnique({ where: { id }, select: { number: true, title: true, createdById: true } });
  if (!issue) return notFound("Issue not found");
  if (issue.createdById !== guard.user.id && !guard.user.permissions.has("admin.users")) {
    return NextResponse.json({ error: "Only the person who logged this issue or an administrator can delete it" }, { status: 403 });
  }
  await prisma.issue.delete({ where: { id } });
  await audit(guard.user.id, "issue.delete", "Issue", id, { number: issueLabel(issue.number), title: issue.title });
  return NextResponse.json({ ok: true });
}

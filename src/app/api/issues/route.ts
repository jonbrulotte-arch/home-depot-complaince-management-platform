import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanPos, issueData, issueInput, issueLabel } from "@/lib/issues";
import { isAssignableTeam } from "@/lib/teams";

/** Logs a new issue with its POs. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const body = await parseJson(req, issueInput);
  if (body.error) return body.error;
  const pos = cleanPos(body.data.pos);
  if (pos.error) return badRequest(pos.error);
  if (body.data.programId && !(await prisma.program.findUnique({ where: { id: body.data.programId }, select: { id: true } }))) return badRequest("Unknown program");
  if (body.data.team && !(await isAssignableTeam(body.data.team, null))) return badRequest("Unknown or inactive team");

  const issue = await prisma.issue.create({
    data: { ...issueData(body.data), createdById: guard.user.id, updatedById: guard.user.id, pos: { create: pos.pos } },
    select: { id: true, number: true },
  });
  await audit(guard.user.id, "issue.create", "Issue", issue.id, { number: issueLabel(issue.number), title: body.data.title, pos: pos.pos.map((p) => p.poNumber) });
  return NextResponse.json(issue, { status: 201 });
}

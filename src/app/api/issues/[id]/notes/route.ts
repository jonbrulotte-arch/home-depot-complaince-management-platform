import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ body: z.string().trim().min(1).max(5000) });

/** Adds an update to an issue's timeline. */
export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  if (!(await prisma.issue.findUnique({ where: { id }, select: { id: true } }))) return notFound("Issue not found");
  const note = await prisma.issueNote.create({ data: { issueId: id, body: body.data.body, authorId: guard.user.id }, select: { id: true } });
  await prisma.issue.update({ where: { id }, data: { updatedById: guard.user.id } });
  await audit(guard.user.id, "issue.note", "Issue", id, { noteId: note.id });
  return NextResponse.json(note, { status: 201 });
}

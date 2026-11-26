import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseResourceLink } from "@/lib/resource-links";

/** Adds a link to a document kept elsewhere (OneDrive…) beside an issue's files. */
export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  if (!(await prisma.issue.findUnique({ where: { id }, select: { id: true } }))) return notFound("Issue not found");
  const link = parseResourceLink(await req.json().catch(() => null));
  if ("error" in link) return badRequest(link.error);
  const created = await prisma.resourceLink.create({ data: { ...link, issueId: id, createdById: guard.user.id }, select: { id: true } });
  await audit(guard.user.id, "issue.link", "Issue", id, { linkId: created.id, ...link });
  return NextResponse.json(created, { status: 201 });
}

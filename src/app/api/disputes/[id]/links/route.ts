import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseResourceLink } from "@/lib/resource-links";

/** Adds a link to a document kept elsewhere (OneDrive…) beside a dispute's attachments. */
export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  if (!(await prisma.dispute.findUnique({ where: { id }, select: { id: true } }))) return notFound("Dispute not found");
  const link = parseResourceLink(await req.json().catch(() => null));
  if ("error" in link) return badRequest(link.error);
  const created = await prisma.resourceLink.create({ data: { ...link, disputeId: id, createdById: guard.user.id }, select: { id: true } });
  await prisma.disputeEvent.create({ data: { disputeId: id, type: "ATTACHMENT", body: `Linked ${link.label}`, userId: guard.user.id } });
  await audit(guard.user.id, "dispute.link", "Dispute", id, { linkId: created.id, ...link });
  return NextResponse.json(created, { status: 201 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Removes a linked resource from a dispute. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id, linkId } = await params;
  const link = await prisma.resourceLink.findFirst({ where: { id: linkId, disputeId: id } });
  if (!link) return notFound("Link not found");
  await prisma.resourceLink.delete({ where: { id: linkId } });
  await prisma.disputeEvent.create({ data: { disputeId: id, type: "ATTACHMENT", body: `Removed the link ${link.label}`, userId: guard.user.id } });
  await audit(guard.user.id, "dispute.unlink", "Dispute", id, { linkId, label: link.label, url: link.url });
  return NextResponse.json({ ok: true });
}

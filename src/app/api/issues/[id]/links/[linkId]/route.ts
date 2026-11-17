import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Removes a linked resource from an issue. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const guard = await requireApiPermission("issues.manage");
  if (guard.error) return guard.error;
  const { id, linkId } = await params;
  const link = await prisma.resourceLink.findFirst({ where: { id: linkId, issueId: id } });
  if (!link) return notFound("Link not found");
  await prisma.resourceLink.delete({ where: { id: linkId } });
  await audit(guard.user.id, "issue.unlink", "Issue", id, { linkId, label: link.label, url: link.url });
  return NextResponse.json({ ok: true });
}

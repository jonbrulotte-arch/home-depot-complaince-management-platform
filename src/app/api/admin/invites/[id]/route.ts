import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Revokes an invitation: its link stops working. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.users");
  if (guard.error) return guard.error;
  const { id } = await params;
  const invite = await prisma.userInvite.findUnique({ where: { id }, select: { email: true, acceptedAt: true, revokedAt: true } });
  if (!invite) return notFound("Invitation not found");
  if (!invite.acceptedAt && !invite.revokedAt) await prisma.userInvite.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(guard.user.id, "user.inviteRevoke", "UserInvite", id, { email: invite.email });
  return NextResponse.json({ ok: true });
}

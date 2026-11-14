import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { appOrigin, emailInvite, inviteState, newInviteToken } from "@/lib/invites";

/** Sends a pending or expired invitation again with a new link; the old link stops working. */
export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.users");
  if (guard.error) return guard.error;
  const { id } = await params;
  const invite = await prisma.userInvite.findUnique({ where: { id }, include: { role: { select: { name: true } } } });
  if (!invite) return notFound("Invitation not found");
  const state = inviteState(invite);
  if (state === "accepted" || state === "revoked") return badRequest(`This invitation was ${state}`);
  if (await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })) return badRequest("Someone with that email already has an account");

  const { token, tokenHash, expiresAt } = newInviteToken();
  const link = `${appOrigin(req)}/invite/${token}`;
  const sent = await emailInvite({ to: invite.email, name: invite.name, roleName: invite.role.name, inviter: guard.user.name, link });
  await prisma.userInvite.update({ where: { id }, data: { tokenHash, expiresAt, sentAt: new Date(), emailed: sent.emailed, invitedById: guard.user.id } });
  await audit(guard.user.id, "user.inviteResend", "UserInvite", id, { email: invite.email, emailed: sent.emailed, ...(sent.reason ? { reason: sent.reason } : {}) });
  return NextResponse.json({ emailed: sent.emailed, reason: sent.reason ?? null, link: sent.emailed ? null : link });
}

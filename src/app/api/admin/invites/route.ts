import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { appOrigin, emailInvite, newInviteToken } from "@/lib/invites";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("must be an email address").max(200),
  name: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((s) => s || null),
  roleId: z.string().trim().min(1, "is required"),
});

/**
 * Invites someone by email: creates the invitation and emails the link. Any earlier pending
 * invitation for the address stops working. When the email can't be sent, the link is returned
 * once so the admin can send it themselves.
 */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.users");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { email, name, roleId } = body.data;
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
  if (!role) return badRequest("Unknown role");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return badRequest("Someone with that email already has an account");

  const { token, tokenHash, expiresAt } = newInviteToken();
  const invite = await prisma.$transaction(async (tx) => {
    await tx.userInvite.updateMany({ where: { email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    return tx.userInvite.create({ data: { email, name, roleId, tokenHash, expiresAt, invitedById: guard.user.id }, select: { id: true } });
  });
  const link = `${appOrigin(req)}/invite/${token}`;
  const sent = await emailInvite({ to: email, name, roleName: role.name, inviter: guard.user.name, link });
  if (sent.emailed) await prisma.userInvite.update({ where: { id: invite.id }, data: { emailed: true } });
  await audit(guard.user.id, "user.invite", "UserInvite", invite.id, { email, role: role.name, emailed: sent.emailed, ...(sent.reason ? { reason: sent.reason } : {}) });
  return NextResponse.json({ id: invite.id, emailed: sent.emailed, reason: sent.reason ?? null, link: sent.emailed ? null : link }, { status: 201 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { appOrigin } from "@/lib/invites";
import { createReset, emailReset } from "@/lib/password-reset";

/**
 * An admin sends a user a password reset email (the key icon in Admin › Users). The user's
 * current password keeps working until they use the link. When the email can't be sent, the
 * link is returned once so the admin can pass it on.
 */
export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.users");
  if (guard.error) return guard.error;
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, active: true } });
  if (!user) return notFound("User not found");
  if (!user.active) return badRequest("This account is inactive. Reactivate it first.");

  // No IP recorded: an admin's sends don't count towards the "Forgot password" limit per address
  const token = await createReset(user.id, null);
  const link = `${appOrigin(req)}/reset-password/${token}`;
  const result = await emailReset({ to: user.email, name: user.name, link });
  await audit(guard.user.id, "user.passwordResetSend", "User", user.id, { email: user.email, sent: result.emailed, ...(result.reason ? { reason: result.reason } : {}) });
  return NextResponse.json({ emailed: result.emailed, reason: result.reason ?? null, link: result.emailed ? null : link });
}

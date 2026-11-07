import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { findInvite, inviteState } from "@/lib/invites";
import { PASSWORD_MIN, hashPassword } from "@/lib/passwords";
import { isTimeZone } from "@/lib/time-zones";

type Params = { params: Promise<{ token: string }> };

const schema = z.object({
  name: z.string().trim().min(1, "is required").max(100),
  password: z.string().min(PASSWORD_MIN, `must be at least ${PASSWORD_MIN} characters`).max(200),
  // null or missing = follow the browser's time zone
  timeZone: z.string().trim().refine(isTimeZone, "is not a known time zone").nullable().optional(),
});

/** Accepts an invitation (no sign-in; the link is the credential): creates the account with the invited role. */
export async function POST(req: Request, { params }: Params) {
  const invite = await findInvite((await params).token);
  if (!invite) return NextResponse.json({ error: "This invitation link is not valid" }, { status: 404 });
  const state = inviteState(invite);
  if (state !== "pending") return badRequest(state === "expired" ? "This invitation has expired. Ask an administrator to send it again." : `This invitation was ${state}`);
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  if (await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })) return badRequest("An account with this email already exists. Sign in instead.");

  const passwordHash = await hashPassword(body.data.password);
  const user = await prisma.$transaction(async (tx) => {
    // Claim the invitation first so the same link can't create two accounts
    const claimed = await tx.userInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) return null;
    return tx.user.create({ data: { email: invite.email, name: body.data.name, roleId: invite.roleId, passwordHash, timeZone: body.data.timeZone ?? null }, select: { id: true } });
  });
  if (!user) return badRequest("This invitation has already been used");
  await audit(user.id, "user.inviteAccept", "User", user.id, { email: invite.email, role: invite.role.name, inviteId: invite.id });
  return NextResponse.json({ ok: true, email: invite.email });
}

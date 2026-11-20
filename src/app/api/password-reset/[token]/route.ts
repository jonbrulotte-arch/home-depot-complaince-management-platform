import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { PASSWORD_MIN, hashPassword } from "@/lib/passwords";
import { findReset, resetState } from "@/lib/password-reset";

type Params = { params: Promise<{ token: string }> };

const schema = z.object({ password: z.string().min(PASSWORD_MIN, `must be at least ${PASSWORD_MIN} characters`).max(200) });

const MESSAGES = {
  invalid: "This reset link is not valid. Ask for a new one.",
  expired: "This reset link has expired. Ask for a new one.",
  used: "This reset link has already been used. Ask for a new one if you need to.",
};

/** Sets a new password from an emailed link (no sign-in; the link is the credential). */
export async function POST(req: Request, { params }: Params) {
  const reset = await findReset((await params).token);
  const state = resetState(reset);
  if (!reset || state !== "valid") return NextResponse.json({ error: MESSAGES[state as keyof typeof MESSAGES] }, { status: state === "invalid" ? 404 : 400 });
  if (!reset.user.active) return badRequest("This account is inactive. Ask an administrator.");
  const body = await parseJson(req, schema);
  if (body.error) return body.error;

  const passwordHash = await hashPassword(body.data.password);
  const done = await prisma.$transaction(async (tx) => {
    // Claim the link first so it can't be used twice
    const claimed = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    // Any other link for this user stops working
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { expiresAt: new Date() } });
    return true;
  });
  if (!done) return badRequest(MESSAGES.used);
  await audit(reset.userId, "auth.passwordReset", "User", reset.userId, { ip: clientIp(req.headers) });
  return NextResponse.json({ ok: true, email: reset.user.email });
}

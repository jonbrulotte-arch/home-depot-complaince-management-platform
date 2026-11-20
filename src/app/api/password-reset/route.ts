import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { appOrigin } from "@/lib/invites";
import { RESET_IP_WINDOW_MINUTES, createReset, emailReset, mayRequestReset } from "@/lib/password-reset";

const schema = z.object({ email: z.string().trim().toLowerCase().email("is not a valid email").max(200) });

/**
 * "Forgot password" (no sign-in). Always answers the same way, so the form can't be used to find
 * out which emails have accounts; what happened is in the App Log.
 */
export async function POST(req: Request) {
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { email } = body.data;
  const ip = clientIp(req.headers);
  const done = NextResponse.json({ ok: true });

  const since = new Date(Date.now() - RESET_IP_WINDOW_MINUTES * 60_000);
  const [user, recentFromIp] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, active: true } }),
    ip ? prisma.passwordReset.count({ where: { requestedIp: ip, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  if (!user || !user.active) {
    await audit(user?.id ?? null, "auth.passwordResetRequest", "User", user?.id, { email, sent: false, reason: user ? "Account is inactive" : "Unknown email", ip });
    return done;
  }
  const last = await prisma.passwordReset.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const allowed = mayRequestReset({ lastForUser: last?.createdAt ?? null, recentFromIp });
  if (allowed !== "ok") {
    const reason = allowed === "ip-limit" ? "Too many requests from this address" : "A link was sent less than 2 minutes ago";
    await audit(user.id, "auth.passwordResetRequest", "User", user.id, { email, sent: false, reason, ip });
    return done;
  }

  // A new link voids any earlier unused one
  const token = await createReset(user.id, ip);
  const result = await emailReset({ to: user.email, name: user.name, link: `${appOrigin(req)}/reset-password/${token}` });
  await audit(user.id, "auth.passwordResetRequest", "User", user.id, { email, sent: result.emailed, ...(result.reason ? { reason: result.reason } : {}), ip });
  return done;
}

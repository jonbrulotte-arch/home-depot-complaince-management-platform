import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { PASSWORD_MIN, hashPassword } from "@/lib/passwords";

const schema = z.object({
  currentPassword: z.string().min(1, "is required").max(200),
  newPassword: z.string().min(PASSWORD_MIN, `must be at least ${PASSWORD_MIN} characters`).max(200),
});

/** Any signed-in user changes their own password, after confirming the current one. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record || !(await bcrypt.compare(body.data.currentPassword, record.passwordHash))) {
    await audit(user.id, "account.passwordFailed", "User", user.id, { reason: "Wrong current password" });
    return badRequest("The current password is not correct");
  }
  if (body.data.newPassword === body.data.currentPassword) return badRequest("Choose a password different from the current one");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.data.newPassword) } });
  await audit(user.id, "account.password", "User", user.id);
  return NextResponse.json({ ok: true });
}

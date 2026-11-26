import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isTimeZone } from "@/lib/time-zones";

const schema = z
  .object({
    name: z.string().trim().min(1, "is required").max(100).optional(),
    // null = follow the browser's time zone
    timeZone: z.string().trim().refine(isTimeZone, "is not a known time zone").nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.timeZone !== undefined, "Nothing to change");

/** Any signed-in user changes their own display name and time zone. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { name, timeZone } = body.data;
  const diff: Record<string, { from: string | null; to: string | null }> = {};
  if (name !== undefined && name !== user.name) diff.name = { from: user.name, to: name };
  if (timeZone !== undefined && timeZone !== user.timeZone) diff.timeZone = { from: user.timeZone, to: timeZone };
  if (Object.keys(diff).length) {
    await prisma.user.update({
      where: { id: user.id },
      data: { ...(diff.name ? { name: diff.name.to! } : {}), ...(diff.timeZone ? { timeZone: diff.timeZone.to } : {}) },
    });
    await audit(user.id, "account.update", "User", user.id, diff);
  }
  return NextResponse.json({ ok: true });
}

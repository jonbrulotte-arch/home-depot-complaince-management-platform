import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ name: z.string().trim().min(1, "is required").max(100) });

/** Any signed-in user changes their own display name. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  if (body.data.name !== user.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: body.data.name } });
    await audit(user.id, "account.update", "User", user.id, { name: { from: user.name, to: body.data.name } });
  }
  return NextResponse.json({ ok: true });
}

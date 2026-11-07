import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(500) });

/** Saves the order teams are listed in (pickers, Admin › Teams). */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.teams");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const all = await prisma.team.findMany({ select: { id: true } });
  const ids = body.data.ids;
  if (ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((t) => ids.includes(t.id))) return badRequest("Send every team exactly once");
  await prisma.$transaction(ids.map((id, i) => prisma.team.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
  await audit(guard.user.id, "team.reorder", "Team", null, {});
  return NextResponse.json({ ok: true });
}

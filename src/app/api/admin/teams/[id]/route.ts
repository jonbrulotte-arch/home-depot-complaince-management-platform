import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().trim().min(1, "is required").max(60).optional(),
  description: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((d) => (d === undefined ? undefined : d || null)),
  active: z.boolean().optional(),
});

/** Renames a team, changes its description, or turns it off (kept on earlier reviews and issues) or on. */
export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.teams");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return notFound("Team not found");
  const { name, description, active } = body.data;
  if (name && name.toLowerCase() !== team.name.toLowerCase() && (await prisma.team.findFirst({ where: { name: { equals: name, mode: "insensitive" }, NOT: { id } } }))) {
    return badRequest("A team with that name already exists");
  }
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (name !== undefined && name !== team.name) diff.name = { from: team.name, to: name };
  if (description !== undefined && description !== team.description) diff.description = { from: team.description, to: description };
  if (active !== undefined && active !== team.active) diff.active = { from: team.active, to: active };
  if (Object.keys(diff).length) {
    await prisma.team.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}), ...(active !== undefined ? { active } : {}) } });
    await audit(guard.user.id, "team.update", "Team", id, { key: team.key, ...diff });
  }
  return NextResponse.json({ ok: true });
}

/** Deletes a team that no review or issue uses; a team in use can only be turned off. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.teams");
  if (guard.error) return guard.error;
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id }, select: { key: true, name: true, _count: { select: { reviews: true, issues: true } } } });
  if (!team) return notFound("Team not found");
  if (team._count.reviews || team._count.issues) {
    return badRequest(`${team.name} is on ${team._count.reviews} violation review(s) and ${team._count.issues} issue(s). Turn it off instead, so those keep their team.`);
  }
  await prisma.team.delete({ where: { id } });
  await audit(guard.user.id, "team.delete", "Team", id, { name: team.name, key: team.key });
  return NextResponse.json({ ok: true });
}

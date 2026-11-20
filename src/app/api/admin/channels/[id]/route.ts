import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanChannelCode } from "@/lib/logistics/channels";

const patchSchema = z.object({
  code: z.string().trim().min(1, "Enter the CUST_NUM value").max(40).transform(cleanChannelCode).optional(),
  name: z.string().trim().min(1, "Enter a name").max(80).optional(),
});

/** Changes a channel's CUST_NUM or name; Logistics shows the change at once (nothing is stored per carton). */
export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  const c = await prisma.channel.findUnique({ where: { id } });
  if (!c) return notFound("Channel not found");
  const { code, name } = body.data;
  const others = await prisma.channel.findMany({ where: { NOT: { id } }, select: { code: true, name: true } });
  if (code && others.some((o) => o.code === code)) return badRequest(`A channel already uses ${code}`);
  if (name && others.some((o) => o.name.toLowerCase() === name.toLowerCase())) return badRequest("A channel with that name already exists");
  await prisma.channel.update({ where: { id }, data: { ...(code ? { code } : {}), ...(name ? { name } : {}) } });
  await audit(guard.user.id, "settings.channelChange", "Channel", id, { from: { code: c.code, name: c.name }, to: { code: code ?? c.code, name: name ?? c.name } });
  return NextResponse.json({ ok: true });
}

/** Removes a channel: its POs, shipments and parcels show as an unknown channel until it is added again. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const { id } = await params;
  const c = await prisma.channel.findUnique({ where: { id } });
  if (!c) return notFound("Channel not found");
  await prisma.channel.delete({ where: { id } });
  await audit(guard.user.id, "settings.channelDelete", "Channel", id, { code: c.code, name: c.name });
  return NextResponse.json({ ok: true });
}

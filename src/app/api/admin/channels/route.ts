import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanChannelCode } from "@/lib/logistics/channels";

const channelSchema = z.object({
  /** The WMS CUST_NUM value, e.g. "THD.COM-DFDC" */
  code: z.string().trim().min(1, "Enter the CUST_NUM value").max(40).transform(cleanChannelCode),
  name: z.string().trim().min(1, "Enter a name").max(80),
});

/** Adds a channel (Admin › Settings › Channels), at the end of the list. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, channelSchema);
  if (body.error) return body.error;
  const all = await prisma.channel.findMany({ select: { code: true, name: true, sortOrder: true } });
  if (all.some((c) => c.code === body.data.code)) return badRequest(`A channel already uses ${body.data.code}`);
  if (all.some((c) => c.name.toLowerCase() === body.data.name.toLowerCase())) return badRequest("A channel with that name already exists");
  const c = await prisma.channel.create({ data: { ...body.data, sortOrder: Math.max(0, ...all.map((x) => x.sortOrder)) + 10 }, select: { id: true } });
  await audit(guard.user.id, "settings.channelAdd", "Channel", c.id, body.data);
  return NextResponse.json(c, { status: 201 });
}

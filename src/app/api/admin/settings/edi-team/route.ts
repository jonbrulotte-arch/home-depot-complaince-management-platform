import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseAddresses } from "@/lib/logistics/edi";

const schema = z.object({ email: z.string().trim().max(1000) });

/** Sets where Logistics › Send to EDI team emails go (one or more addresses; empty clears it). */
export async function PUT(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const list = parseAddresses(body.data.email);
  if (!list) return badRequest("Enter email addresses separated by commas");
  const value = list.length ? list.join(", ") : null;
  await prisma.siteSettings.upsert({ where: { id: "site" }, create: { id: "site", ediTeamEmail: value, updatedById: guard.user.id }, update: { ediTeamEmail: value, updatedById: guard.user.id } });
  await audit(guard.user.id, "settings.ediTeam", "SiteSettings", "site", { email: value });
  return NextResponse.json({ email: value });
}

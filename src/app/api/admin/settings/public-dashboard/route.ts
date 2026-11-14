import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ action: z.enum(["enable", "reset", "disable"]) });

/** Turns the public dashboard on (keeping its link), gives it a new link, or turns it off. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { action } = body.data;

  const current = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { publicDashboardToken: true } });
  const token = action === "disable" ? null : action === "enable" && current?.publicDashboardToken ? current.publicDashboardToken : randomBytes(24).toString("base64url");
  await prisma.siteSettings.upsert({
    where: { id: "site" },
    create: { id: "site", publicDashboardToken: token, updatedById: guard.user.id },
    update: { publicDashboardToken: token, updatedById: guard.user.id },
  });
  await audit(guard.user.id, "settings.publicDashboard", "SiteSettings", "site", { action });
  return NextResponse.json({ token });
}

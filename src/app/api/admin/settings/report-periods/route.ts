import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ basis: z.enum(["RECEIVED_MONTH", "FISCAL_MONTH"]) });

export async function PUT(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  await prisma.siteSettings.upsert({
    where: { id: "site" },
    create: { id: "site", reportPeriodBasis: body.data.basis, updatedById: guard.user.id },
    update: { reportPeriodBasis: body.data.basis, updatedById: guard.user.id },
  });
  await audit(guard.user.id, "settings.reportPeriods", "SiteSettings", "site", body.data);
  return NextResponse.json({ ok: true });
}

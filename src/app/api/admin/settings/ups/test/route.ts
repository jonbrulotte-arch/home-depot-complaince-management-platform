import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { UPS_PRODUCTION, UPS_TEST, testUpsCredentials } from "@/lib/logistics/ups";

const schema = z.object({ clientId: z.string().trim().max(200), clientSecret: z.string().trim().max(500).optional(), testMode: z.boolean() });

/** Signs in to UPS with the credentials typed (an empty secret uses the saved one). */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const saved = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { upsClientSecret: true } });
  const clientSecret = body.data.clientSecret || saved?.upsClientSecret || "";
  try {
    await testUpsCredentials({ clientId: body.data.clientId, clientSecret, base: body.data.testMode ? UPS_TEST : UPS_PRODUCTION });
    await audit(guard.user.id, "settings.upsTest", "SiteSettings", "site", { ok: true, testMode: body.data.testMode });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UPS sign-in failed";
    await audit(guard.user.id, "settings.upsTest", "SiteSettings", "site", { ok: false, error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

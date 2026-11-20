import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { isUps } from "@/lib/logistics/refs";
import { refreshUpsTracking } from "@/lib/logistics/ups";

const body = z.object({ numbers: z.array(z.string().trim().toUpperCase()).max(50).optional(), force: z.boolean().optional() }).optional();

/** Asks UPS for the latest tracking (the numbers given, or every number due for a check). */
export async function POST(req: Request) {
  const guard = await requireApiPermission("logistics.view");
  if (guard.error) return guard.error;
  const parsed = body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Send { numbers?: string[], force?: boolean }" }, { status: 400 });
  const numbers = parsed.data?.numbers?.filter(isUps);
  // Viewers may refresh the numbers on the page they're looking at; a full refresh needs manage
  if (!numbers?.length && !guard.user.permissions.has("logistics.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await refreshUpsTracking({ numbers: numbers?.length ? numbers : undefined, force: parsed.data?.force });
    await audit(guard.user.id, "logistics.upsRefresh", "ParcelTracking", null, result);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "UPS tracking failed" }, { status: 502 });
  }
}

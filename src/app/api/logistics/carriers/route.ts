import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanTrackingUrl } from "@/lib/logistics/refs";

const schema = z.object({
  scac: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,4}$/, "A SCAC is 2 to 4 letters"),
  name: z.string().trim().min(1, "Give the carrier's name").max(120),
  mode: z.enum(["LTL", "TL", "Parcel"]).nullable().optional(),
  trackingUrl: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

/** Adds or updates a carrier (by SCAC) and its tracking link. */
export async function PUT(req: Request) {
  const guard = await requireApiPermission("logistics.manage");
  if (guard.error) return guard.error;
  const parsed = await parseJson(req, schema);
  if (parsed.error) return parsed.error;
  const { scac, name, mode, trackingUrl, notes } = parsed.data;
  const url = cleanTrackingUrl(trackingUrl);
  if (trackingUrl && !url) return badRequest("The tracking link must be a web address starting with https://");
  const data = { name, mode: mode ?? null, trackingUrl: url, notes: notes || null };
  const carrier = await prisma.carrierLink.upsert({ where: { scac }, create: { scac, ...data }, update: data });
  await audit(guard.user.id, "logistics.carrier", "CarrierLink", carrier.id, { scac, name, trackingUrl: url });
  return NextResponse.json(carrier);
}

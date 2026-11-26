import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireApiPermission } from "@/lib/auth-guard";
import { getBranding } from "@/lib/branding";
import { normalizePackageId } from "@/lib/package-id";
import { packageWorkbook } from "@/lib/package-export";
import { packageReport } from "@/lib/packages";

type Params = { params: Promise<{ packageId: string }> };

/** A chargeback package's POs and offsets as an xlsx download. */
export async function GET(_req: Request, { params }: Params) {
  const guard = await requireApiPermission("view.polookup");
  if (guard.error) return guard.error;
  const id = normalizePackageId((await params).packageId);
  const pkg = id ? await packageReport(id) : null;
  if (!pkg) return NextResponse.json({ error: "No report has that Package ID" }, { status: 404 });
  await audit(guard.user.id, "package.export", "ChargebackPackage", pkg.packageId, { pos: pkg.totals.pos, lines: pkg.totals.lines });
  const buffer = await packageWorkbook(pkg, (await getBranding()).siteName);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Chargeback_Package_${pkg.packageId.replace(/[^A-Za-z0-9._-]/g, "_")}.xlsx"`,
    },
  });
}

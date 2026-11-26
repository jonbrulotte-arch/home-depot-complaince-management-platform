import { prisma } from "@/lib/prisma";
import { normalizeVendorNumber } from "@/lib/vendor-numbers";

// The vendor numbers found in the data, for Admin › Programs & Rules: POM's Vendor # (POs) and SPM's
// M-Vendor (PO records, with the programs THD reported their lines under), so an admin can see which
// numbers to assign to which program.

export interface VendorSeen {
  vendor: string;
  name: string | null;
  pomPos: number;
  /** Program code → PO records THD reported under it */
  spmPrograms: Record<string, number>;
}

export async function vendorNumbersSeen(): Promise<VendorSeen[]> {
  const [pom, spm] = await Promise.all([
    prisma.pomPurchaseOrder.groupBy({ by: ["vendorNumber"], _count: { _all: true }, where: { vendorNumber: { not: null } } }),
    prisma.$queryRaw<{ vendor: string; name: string | null; program: string; n: bigint }[]>`
      SELECT pr."mVendor" AS vendor, max(pr."mVendorName") AS name, p.code AS program, count(DISTINCT pr.id) AS n
      FROM "PoRecord" pr
      JOIN "ComplianceLine" cl ON cl."poRecordId" = pr.id
      JOIN "Metric" m ON m.id = cl."metricId"
      JOIN "Program" p ON p.id = m."programId"
      WHERE pr."mVendor" IS NOT NULL
      GROUP BY pr."mVendor", p.code`,
  ]);
  const seen = new Map<string, VendorSeen>();
  const get = (raw: string | null) => {
    const v = normalizeVendorNumber(raw);
    if (v === null) return null;
    if (!seen.has(v)) seen.set(v, { vendor: v, name: null, pomPos: 0, spmPrograms: {} });
    return seen.get(v)!;
  };
  for (const r of pom) {
    const s = get(r.vendorNumber);
    if (s) s.pomPos += r._count._all;
  }
  for (const r of spm) {
    const s = get(r.vendor);
    if (!s) continue;
    s.name = s.name ?? r.name;
    s.spmPrograms[r.program] = (s.spmPrograms[r.program] ?? 0) + Number(r.n);
  }
  return [...seen.values()].sort((a, b) => a.vendor.localeCompare(b.vendor, undefined, { numeric: true }));
}

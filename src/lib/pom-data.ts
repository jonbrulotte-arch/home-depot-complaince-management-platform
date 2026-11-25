import { prisma } from "@/lib/prisma";
import { poNumberVariants } from "@/lib/issues";
import { toPomPo } from "@/lib/logistics/data";
import type { PomPo } from "@/lib/logistics/views";
import { pomEvidence, type PomEvidence } from "@/lib/pom";

// POM (THD's Purchase Order Management) for the compliance side: evidence for violations under review
// and disputes, and filling compliance lines' missing SKUs and descriptions.

const bare = (po: string) => po.trim().toUpperCase().replace(/^0+(?=\d)/, "");

/** POM POs for PO numbers as compliance data has them (with or without leading zeros), keyed without leading zeros */
export async function pomByPoNumbers(numbers: string[]): Promise<Map<string, PomPo>> {
  const variants = [...new Set(numbers.filter(Boolean).flatMap((n) => poNumberVariants(n.trim().toUpperCase())))];
  if (!variants.length) return new Map();
  const rows = await prisma.pomPurchaseOrder.findMany({ where: { poNumber: { in: variants } }, include: { lines: true } });
  return new Map(rows.map((r) => [bare(r.poNumber), toPomPo(r)]));
}

/** POM's evidence for compliance lines, keyed by `key`; lines whose PO isn't in POM are left out */
export async function pomEvidenceFor(lines: { key: string; poNumber: string | null; sku: string | null; vendorSku: string | null }[]): Promise<Record<string, PomEvidence>> {
  const pom = await pomByPoNumbers(lines.map((l) => l.poNumber ?? ""));
  const out: Record<string, PomEvidence> = {};
  for (const l of lines) {
    const p = l.poNumber ? pom.get(bare(l.poNumber)) : undefined;
    if (p) out[l.key] = pomEvidence(p, { thdSku: l.sku, vendorSku: l.vendorSku });
  }
  return out;
}

/**
 * Fills compliance lines' missing THD SKU, our SKU and description from POM's SKU lines for the same
 * PO (matched by THD's SKU or our SKU). Only empty fields are filled; THD's original columns (`raw`)
 * are never changed. Returns how many lines were updated.
 */
export async function fillComplianceFromPom(poNumbers?: string[]): Promise<number> {
  const pos = await prisma.pomPurchaseOrder.findMany({
    where: poNumbers ? { poNumber: { in: [...new Set(poNumbers.flatMap((n) => poNumberVariants(n)))] } } : undefined,
    select: { poNumber: true, lines: { select: { thdSku: true, partNumber: true, description: true } } },
  });
  let updated = 0;
  for (const po of pos) {
    const where = { poNumber: { in: poNumberVariants(po.poNumber) } };
    for (const l of po.lines) {
      const thd = l.thdSku?.trim() || null;
      const ours = l.partNumber?.trim() || null;
      const desc = l.description?.trim() || null;
      if (ours && thd) updated += (await prisma.complianceLine.updateMany({ where: { ...where, vendorSku: ours, sku: null }, data: { sku: thd } })).count;
      if (thd && ours) updated += (await prisma.complianceLine.updateMany({ where: { ...where, sku: thd, vendorSku: null }, data: { vendorSku: ours } })).count;
      if (desc) {
        const match = [thd ? { sku: thd } : null, ours ? { vendorSku: ours } : null].filter((x): x is NonNullable<typeof x> => Boolean(x));
        if (match.length) updated += (await prisma.complianceLine.updateMany({ where: { ...where, skuDescription: null, OR: match }, data: { skuDescription: desc } })).count;
      }
    }
  }
  return updated;
}

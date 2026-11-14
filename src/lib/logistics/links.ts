import { prisma } from "@/lib/prisma";
import { poNumberVariants } from "@/lib/issues";

// Logistics POs in the compliance data: each PO number's PO records (one per use of the number)
// with THD's violations and offsets on them.

export interface CompliancePo {
  recordId: string;
  poNumber: string;
  poCreateDate: Date | null;
  violations: number;
  offsets: number;
  metrics: string[];
}

export async function complianceForPos(numbers: string[]): Promise<Map<string, CompliancePo[]>> {
  const out = new Map<string, CompliancePo[]>();
  const wanted = [...new Set(numbers.map((n) => n.trim().toUpperCase()).filter(Boolean))];
  if (!wanted.length) return out;
  const records = await prisma.poRecord.findMany({
    where: { poNumber: { in: [...new Set(wanted.flatMap(poNumberVariants))] } },
    select: {
      id: true,
      poNumber: true,
      poCreateDate: true,
      lines: {
        where: { isCompliant: false, NOT: { review: { disposition: "RESOLVED" } } },
        select: { offsetAmount: true, metric: { select: { name: true, program: { select: { name: true } } } } },
      },
    },
    orderBy: { poCreateDate: "desc" },
  });
  for (const n of wanted) {
    const names = poNumberVariants(n);
    const list = records
      .filter((r) => names.includes(r.poNumber))
      .map((r) => ({
        recordId: r.id,
        poNumber: r.poNumber,
        poCreateDate: r.poCreateDate,
        violations: r.lines.length,
        offsets: Math.round(r.lines.reduce((s, l) => s + Number(l.offsetAmount), 0) * 100) / 100,
        metrics: [...new Set(r.lines.map((l) => `${l.metric.program.name} · ${l.metric.name}`))],
      }));
    if (list.length) out.set(n, list);
  }
  return out;
}

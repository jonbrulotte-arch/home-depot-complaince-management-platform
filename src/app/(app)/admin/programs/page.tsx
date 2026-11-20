import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { CANONICAL_FIELDS } from "@/lib/import/transform";
import { ProgramsAdmin } from "./programs-admin";

export default async function ProgramsPage() {
  await requirePagePermission("admin.programs");
  const [programs, aliases] = await Promise.all([
    prisma.program.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        metrics: {
          orderBy: { sortOrder: "asc" },
          include: { rules: { orderBy: { effectiveFrom: "desc" } }, reasonCodes: { where: { active: true }, orderBy: { code: "asc" } } },
        },
      },
    }),
    prisma.columnAlias.findMany({ orderBy: [{ canonicalField: "asc" }, { sourceHeader: "asc" }] }),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Programs &amp; Rules</h1>
        <p className="text-sm text-gray-500 mt-1">
          Compliance programs, their metrics, the threshold and offset rules in force by fiscal month, dispute reason codes, and how SPM export columns map into the PO records database.
        </p>
      </div>
      <ProgramsAdmin
        canonicalFields={[...CANONICAL_FIELDS].sort()}
        programs={programs.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          filePrefix: p.filePrefix,
          metrics: p.metrics.map((m) => ({
            id: m.id,
            code: m.code,
            name: m.name,
            sheetNames: m.sheetNames,
            active: m.active,
            rules: m.rules.map((r) => ({ id: r.id, effectiveFrom: r.effectiveFrom, thresholdPct: Number(r.thresholdPct), offsetType: r.offsetType, offsetAmount: Number(r.offsetAmount), notes: r.notes })),
            reasonCodes: m.reasonCodes.map((c) => ({ id: c.id, code: c.code, whenToUse: c.whenToUse, requiredDocs: c.requiredDocs })),
          })),
        }))}
        aliases={aliases.map((a) => ({ id: a.id, programId: a.programId, metricId: a.metricId, sourceHeader: a.sourceHeader, canonicalField: a.canonicalField }))}
      />
    </div>
  );
}

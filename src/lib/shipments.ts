import type { ShipmentMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Programs that ship to THD and so have shipment counts; Transportation's LTL total is derived. */
export const SHIPMENT_PROGRAMS = ["US_DS", "US_RDC", "US_DFC"];
export const SHIPMENT_MODES: { mode: ShipmentMode; label: string }[] = [
  { mode: "SMALL_PARCEL", label: "Small Parcel" },
  { mode: "LTL_TL", label: "LTL & TL" },
];

export interface ShipmentInput {
  programId: string;
  code: string;
  name: string;
  counts: Record<ShipmentMode, number | null>;
  /** Values derived from the SPM data, when it carries enough to suggest them */
  suggested: Partial<Record<ShipmentMode, number>>;
  /** Distinct TMS shipments in the On Time data, a reference for RDC/DFC totals */
  shipmentsInData: number | null;
}

export async function getShipmentInputs(reportId: string): Promise<ShipmentInput[]> {
  const report = await prisma.complianceReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { period: true, shipments: true, programs: { include: { program: true }, orderBy: { program: { sortOrder: "asc" } } } },
  });
  const fiscalMonth = report.period.fiscalMonth;
  const programs = report.programs.map((p) => p.program).filter((p) => SHIPMENT_PROGRAMS.includes(p.code));

  return Promise.all(
    programs.map(async (program) => {
      const stored = report.shipments.filter((s) => s.programId === program.id);
      const counts = { SMALL_PARCEL: null, LTL_TL: null } as Record<ShipmentMode, number | null>;
      for (const s of stored) counts[s.mode] = s.count;

      const suggested: ShipmentInput["suggested"] = {};
      let shipmentsInData: number | null = null;
      if (program.code === "US_DS") {
        // Drop Ship On Time rows are orders and carry THD's Parcel flag
        const rows = await prisma.$queryRaw<{ parcel: string | null; n: bigint }[]>`
          SELECT l.raw->>'Parcel' AS parcel, COUNT(*) AS n
          FROM "ComplianceLine" l JOIN "Metric" m ON m.id = l."metricId"
          WHERE l."fiscalMonth" = ${fiscalMonth} AND m."programId" = ${program.id} AND m.code = 'ON_TIME'
          GROUP BY 1`;
        const n = (value: string) => Number(rows.find((r) => r.parcel === value)?.n ?? 0);
        if (rows.some((r) => r.parcel === "true" || r.parcel === "false")) {
          suggested.SMALL_PARCEL = n("true");
          suggested.LTL_TL = n("false");
        }
      } else {
        const distinct = await prisma.complianceLine.findMany({
          where: { fiscalMonth, metric: { programId: program.id, code: "ON_TIME" }, tmsId: { not: null } },
          distinct: ["tmsId"],
          select: { tmsId: true },
        });
        shipmentsInData = distinct.length || null;
      }
      return { programId: program.id, code: program.code, name: program.name, counts, suggested, shipmentsInData };
    }),
  );
}

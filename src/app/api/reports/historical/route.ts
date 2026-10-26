import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { createHistoricalReport, deleteHistoricalReports, planHistoricalReports } from "@/lib/historical";

/** Preview: the months that would become historical reports (?rebuild=1 to replace existing ones). */
export async function GET(req: Request) {
  const guard = await requireApiPermission("reports.advance");
  if (guard.error) return guard.error;
  const rebuild = new URL(req.url).searchParams.get("rebuild") === "1";
  const [plan, historicalCount] = await Promise.all([planHistoricalReports(prisma, { rebuild }), prisma.complianceReport.count({ where: { historical: true } })]);
  return NextResponse.json({ ...plan, historicalCount });
}

/** Creates and publishes a historical report for every month in the preview. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("reports.advance");
  if (guard.error) return guard.error;
  const rebuild = new URL(req.url).searchParams.get("rebuild") === "1";
  const plan = await planHistoricalReports(prisma, { rebuild });
  if (rebuild && plan.months.length) await deleteHistoricalReports(prisma);
  const results = [];
  for (const month of plan.months) results.push(await createHistoricalReport(prisma, month, guard.user.id));
  await audit(guard.user.id, "reports.historical", "ComplianceReport", null, { months: results.map((r) => r.fiscalMonth) });
  return NextResponse.json({ created: results });
}

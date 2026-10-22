import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { createHistoricalReport, planHistoricalReports } from "@/lib/historical";

/** Preview: the months that would become historical reports. */
export async function GET() {
  const guard = await requireApiPermission("reports.advance");
  if (guard.error) return guard.error;
  return NextResponse.json(await planHistoricalReports(prisma));
}

/** Creates and publishes a historical report for every month in the preview. */
export async function POST() {
  const guard = await requireApiPermission("reports.advance");
  if (guard.error) return guard.error;
  const plan = await planHistoricalReports(prisma);
  const results = [];
  for (const month of plan.months) results.push(await createHistoricalReport(prisma, month, guard.user.id));
  await audit(guard.user.id, "reports.historical", "ComplianceReport", null, { months: results.map((r) => r.fiscalMonth) });
  return NextResponse.json({ created: results });
}

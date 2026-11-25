import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { loadDisputesForEmail } from "@/lib/dispute-email-data";
import { disputeReportFileName, MAX_DISPUTE_SELECTION } from "@/lib/dispute-email";
import { disputeReportPdf } from "@/lib/dispute-report-pdf";
import { getTimeZone } from "@/lib/time-zone-server";

/** The dispute report PDF for selected disputes of a report (?ids=a,b). */
export async function GET(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("reports.view");
  if (guard.error) return guard.error;
  const { id } = await params;
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_DISPUTE_SELECTION);
  if (!ids.length) return badRequest("Select at least one dispute");
  const data = await loadDisputesForEmail(id, ids);
  if (!data) return notFound("Report not found");
  if (!data.disputes.length) return badRequest("None of the selected disputes belongs to this report");
  const tz = await getTimeZone();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const pdf = await disputeReportPdf({ reportTitle: data.report.title, disputes: data.disputes, teams: data.teams, by: guard.user.name, timeZone: tz, windowCloses: data.report.period.disputeClose, siteName: (await getBranding()).siteName, pom: data.pom });
  await audit(guard.user.id, "disputes.report", "ComplianceReport", id, { count: data.disputes.length });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${disputeReportFileName(data.disputes.length, today)}"`, "Cache-Control": "private, no-store" },
  });
}

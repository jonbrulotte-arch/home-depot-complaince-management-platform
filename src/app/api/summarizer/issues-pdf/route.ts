import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { requireApiPermission } from "@/lib/auth-guard";
import { getBranding } from "@/lib/branding";
import { parseReportRange } from "@/lib/issue-report";
import { loadIssueReport } from "@/lib/issue-report-data";
import { issueReportPdf } from "@/lib/issue-report-pdf";
import { getTimeZone } from "@/lib/time-zone-server";

/** The Summarizer's Issues report for ?from=YYYY-MM-DD&to=YYYY-MM-DD as a PDF download (needs the Issue Log too). */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("summarizer.use");
  if (guard.error) return guard.error;
  if (!guard.user.permissions.has("issues.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const range = parseReportRange(req.nextUrl.searchParams.get("from") ?? undefined, req.nextUrl.searchParams.get("to") ?? undefined);
  if (!range) return NextResponse.json({ error: "Give a start and end date (YYYY-MM-DD), at most three years apart" }, { status: 400 });
  const [report, { siteName }, timeZone] = await Promise.all([loadIssueReport(range), getBranding(), getTimeZone()]);
  const buffer = await issueReportPdf(report, { timeZone, siteName });
  await audit(guard.user.id, "summary.issuesExport", "Summary", null, { from: range.fromKey, to: range.toKey, issues: report.totals.issues });
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Issues_Report_${range.fromKey}_to_${range.toKey}.pdf"`, "Cache-Control": "private, no-store" },
  });
}

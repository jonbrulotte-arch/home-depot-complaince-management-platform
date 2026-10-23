import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { getBranding } from "@/lib/branding";
import { parseReportIds, periodsLabel } from "@/lib/summarizer";
import { loadSummary } from "@/lib/summarizer-data";
import { summaryPdf } from "@/lib/summary-pdf";

/** The Summarizer's summary of the chosen reports (?r=<ids>) as a PDF download. */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("summarizer.use");
  if (guard.error) return guard.error;
  const { summary, dashboardPath } = await loadSummary(parseReportIds(req.nextUrl.searchParams.get("r")));
  if (!summary) return NextResponse.json({ error: "Choose at least one published report" }, { status: 400 });
  // Links in the PDF use the address the site was opened at
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, "");
  const buffer = await summaryPdf(summary, { origin: `${proto}://${host}`, dashboardPath }, (await getBranding()).siteName);
  const name = `THD_Scorecard_Summary_${periodsLabel(summary).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` },
  });
}

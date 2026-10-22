import { NextResponse } from "next/server";
import type { IdParams } from "@/lib/api";
import { getBranding } from "@/lib/branding";
import { scorecardPdf } from "@/lib/scorecard-pdf";
import { scorecardForDownload } from "@/lib/scorecard-store";

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  const found = await scorecardForDownload(id);
  if (found.error) return found.error;
  const buffer = await scorecardPdf(found.data, found.status, (await getBranding()).siteName);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="THD_Compliance_Scorecard_FM${found.data.fiscalMonth}_v${found.status.version}.pdf"`,
    },
  });
}

import { NextResponse } from "next/server";
import type { IdParams } from "@/lib/api";
import { scorecardWorkbook } from "@/lib/scorecard-export";
import { scorecardForDownload } from "@/lib/scorecard-store";

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  const found = await scorecardForDownload(id);
  if (found.error) return found.error;
  const buffer = await scorecardWorkbook(found.data, found.status);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="THD_Compliance_Scorecard_FM${found.data.fiscalMonth}_v${found.status.version}.xlsx"`,
    },
  });
}

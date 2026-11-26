import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { issuesWorkbook } from "@/lib/issue-export";

/** The Issue Log, with the list's filters, as an Excel download. */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("issues.view");
  if (guard.error) return guard.error;
  const p = req.nextUrl.searchParams;
  const get = (k: string) => p.get(k) ?? undefined;
  const filters = { q: get("q"), status: get("status"), category: get("category"), from: get("from"), to: get("to") };
  const buffer = await issuesWorkbook(filters, (await getBranding()).siteName);
  await audit(guard.user.id, "issue.export", "Issue", null, filters);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Issue_Log_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

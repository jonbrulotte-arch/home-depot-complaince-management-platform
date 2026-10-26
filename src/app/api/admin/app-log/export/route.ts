import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireApiPermission } from "@/lib/auth-guard";
import { actionCategory, actionLabel, csvLine, logWhere } from "@/lib/app-log";

const MAX_ROWS = 50_000;

/** The App Log entries matching the page's filters, newest first, as CSV. */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("admin.audit");
  if (guard.error) return guard.error;
  const p = req.nextUrl.searchParams;
  const get = (k: string) => p.get(k) ?? undefined;
  const entries = await prisma.auditLog.findMany({
    where: logWhere({ q: get("q"), userId: get("userId"), category: get("category"), from: get("from"), to: get("to") }),
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: MAX_ROWS,
    include: { user: { select: { name: true, email: true } } },
  });
  const lines = [
    csvLine(["Time (UTC)", "User", "Email", "Event", "Category", "Action", "Item", "Item ID", "Details"]),
    ...entries.map((e) =>
      csvLine([
        e.at.toISOString(),
        e.user?.name,
        e.user?.email,
        actionLabel(e.action),
        actionCategory(e.action),
        e.action,
        e.entity,
        e.entityId,
        e.details == null ? "" : JSON.stringify(e.details),
      ]),
    ),
  ];
  await audit(guard.user.id, "appLog.export", "AuditLog", null, { rows: entries.length });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="App_Log_${stamp}.csv"` },
  });
}

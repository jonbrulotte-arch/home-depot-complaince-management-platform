import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel, issueWhere, type IssueFilters } from "@/lib/issues";
import { issueCounts } from "@/lib/issues-data";
import { cn, formatCurrency, formatUtcDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { IssueFiltersBar } from "./issue-filters";

const PAGE_SIZE = 50;
const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm align-top";

export default async function IssueLogPage({ searchParams }: { searchParams: Promise<IssueFilters & { page?: string }> }) {
  const user = await requirePagePermission("issues.view");
  const sp = await searchParams;
  const filters: IssueFilters = { q: sp.q, status: sp.status, category: sp.category, from: sp.from, to: sp.to };
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const where = issueWhere(filters);
  const [issues, total, { count, recent }] = await Promise.all([
    prisma.issue.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { number: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { pos: { select: { poNumber: true }, orderBy: { poNumber: "asc" } }, createdBy: { select: { name: true } } },
    }),
    prisma.issue.count({ where }),
    issueCounts(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    if (p > 1) params.set("page", String(p));
    return `/issues?${params}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issue Log</h1>
          <p className="text-sm text-gray-500 mt-1">
            Problems with POs as they happen: what went wrong, what was done, the consequences, who was involved and the HD Support ticket. Each issue links to the
            compliance data for its POs once THD&apos;s exports for them are imported.
          </p>
        </div>
        {user.permissions.has("issues.manage") && (
          <Button asChild>
            <Link href="/issues/new">
              <Plus className="h-4 w-4 mr-1.5" />
              Log an issue
            </Link>
          </Button>
        )}
      </div>

      <StatTiles
        stats={[
          { label: "Open", value: String(count("OPEN")), tone: count("OPEN") ? "text-red-700" : undefined },
          { label: "In progress", value: String(count("IN_PROGRESS")) },
          { label: "Resolved", value: String(count("RESOLVED")) },
          { label: "Closed", value: String(count("CLOSED")) },
          { label: "Logged in the last 30 days", value: String(recent), hint: "by date of the issue" },
        ]}
      />

      <IssueFiltersBar filters={filters} />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {issues.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">{total === 0 && !Object.values(filters).some(Boolean) ? "No issues have been logged yet." : "No issues match these filters."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["Issue", "Date", "Title", "POs", "Category", "Severity", "Status", "HD tickets", "Est. max fine", "Logged by"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issues.map((i) => (
                    <tr key={i.id} className="border-t border-gray-200">
                      <td className={cn(td, "whitespace-nowrap")}>
                        <Link href={`/issues/${i.id}`} className="font-medium text-blue-600 hover:underline">
                          {issueLabel(i.number)}
                        </Link>
                      </td>
                      <td className={cn(td, "text-gray-700 whitespace-nowrap")}>{formatUtcDate(i.issueDate)}</td>
                      <td className={cn(td, "text-gray-900")}>
                        <Link href={`/issues/${i.id}`} className="hover:underline">
                          {i.title}
                        </Link>
                      </td>
                      <td className={cn(td, "text-gray-700")}>
                        {i.pos.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span title={i.pos.map((p) => p.poNumber).join(", ")}>
                            {i.pos
                              .slice(0, 3)
                              .map((p) => p.poNumber)
                              .join(", ")}
                            {i.pos.length > 3 && <span className="text-gray-500"> +{i.pos.length - 3} more</span>}
                          </span>
                        )}
                      </td>
                      <td className={cn(td, "text-gray-700")}>{i.category}</td>
                      <td className={cn(td, i.severity === "HIGH" ? "font-medium text-red-700" : "text-gray-700")}>{ISSUE_SEVERITIES[i.severity]}</td>
                      <td className={td}>
                        <Badge variant={ISSUE_STATUSES[i.status].variant} className="whitespace-nowrap">
                          {ISSUE_STATUSES[i.status].label}
                        </Badge>
                      </td>
                      <td className={cn(td, "whitespace-nowrap", i.hdTickets.length ? "text-gray-700" : "text-gray-400")}>
                        {i.hdTickets.length ? i.hdTickets.map((t) => <div key={t}>{t}</div>) : "—"}
                      </td>
                      <td className={cn(td, "whitespace-nowrap tabular-nums", i.estimatedFine === null ? "text-gray-400" : "text-gray-700")}>
                        {i.estimatedFine === null ? "—" : formatCurrency(i.estimatedFine).replace(/\.00$/, "")}
                      </td>
                      <td className={cn(td, "text-gray-700")}>{i.createdBy?.name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {total.toLocaleString("en-US")} issues · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
              {page > 1 ? (
                <Link href={pageHref(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Newer
                </Link>
              ) : (
                <span>
                  <ChevronLeft className="h-4 w-4 mr-1 inline" />
                  Newer
                </span>
              )}
            </Button>
            <Button asChild={page < pages} variant="outline" size="sm" disabled={page >= pages}>
              {page < pages ? (
                <Link href={pageHref(page + 1)}>
                  Older
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              ) : (
                <span>
                  Older
                  <ChevronRight className="h-4 w-4 ml-1 inline" />
                </span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { actionCategory, actionLabel, detailPairs, entryLink, logWhere, type LogFilters } from "@/lib/app-log";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogFiltersBar } from "./log-filters";

const PAGE_SIZE = 50;
const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm align-top";

type Search = LogFilters & { page?: string };

export default async function AppLogPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePagePermission("admin.audit");
  const sp = await searchParams;
  const filters: LogFilters = { q: sp.q, userId: sp.userId, category: sp.category, from: sp.from, to: sp.to };
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const where = logWhere(filters);

  const [entries, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    if (p > 1) params.set("page", String(p));
    return `/admin/app-log?${params}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">App Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every event in the platform: sign-ins (including failed ones), report work, imports, reviews, disputes, scorecards, feedback, exports, and changes to users,
          roles, configuration and backups. Scorecard page views are in View Analytics.
        </p>
      </div>

      <LogFiltersBar filters={filters} users={users} />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">No events match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["When", "User", "Event", "Item", "Details"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const link = entryLink(e.entity, e.entityId, e.details);
                    const pairs = detailPairs(e.details);
                    const failed = e.action === "auth.signInFailed";
                    return (
                      <tr key={e.id} className="border-t border-gray-200">
                        <td className={cn(td, "text-gray-700 whitespace-nowrap")}>{formatDateTime(e.at)}</td>
                        <td className={td}>
                          {e.user ? (
                            <>
                              <div className="text-gray-900">{e.user.name}</div>
                              <div className="text-xs text-gray-500">{e.user.email}</div>
                            </>
                          ) : (
                            <span className="text-gray-400">No user</span>
                          )}
                        </td>
                        <td className={td}>
                          <div className={cn("font-medium", failed ? "text-red-700" : "text-gray-900")}>{actionLabel(e.action)}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Badge variant={failed ? "destructive" : "secondary"} className="whitespace-nowrap">{actionCategory(e.action)}</Badge>
                            <span className="font-mono text-xs text-gray-400">{e.action}</span>
                          </div>
                        </td>
                        <td className={cn(td, "text-gray-700")}>
                          {e.entity}
                          {e.entityId && (
                            <div className="max-w-48 truncate font-mono text-xs text-gray-500" title={e.entityId}>
                              {link ? (
                                <Link href={link} className="text-blue-600 hover:underline">
                                  {e.entityId}
                                </Link>
                              ) : (
                                e.entityId
                              )}
                            </div>
                          )}
                          {!e.entityId && link && (
                            <Link href={link} className="block text-xs text-blue-600 hover:underline">
                              Open
                            </Link>
                          )}
                        </td>
                        <td className={cn(td, "text-gray-700")}>
                          {pairs.length === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <details className="max-w-xs">
                              <summary className="cursor-pointer list-none">
                                {pairs.map((p) => (
                                  <div key={p} className="truncate text-xs text-gray-600">
                                    {p}
                                  </div>
                                ))}
                                <span className="text-xs text-blue-600">Show all</span>
                              </summary>
                              <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-gray-50 p-2 text-xs text-gray-700 whitespace-pre-wrap break-all">
                                {JSON.stringify(e.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {total.toLocaleString("en-US")} event{total === 1 ? "" : "s"}
          {total > 0 && ` · page ${page} of ${pages}`}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Newer
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Newer
            </Button>
          )}
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>
                Older
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Older
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

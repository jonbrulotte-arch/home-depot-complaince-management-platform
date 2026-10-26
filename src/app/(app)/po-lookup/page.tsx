import Link from "next/link";
import { Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { fiscalLabel } from "@/lib/fiscal";
import { formatCurrency, formatUtcDate, formatUtcDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ComplianceBadge, DispositionBadge } from "@/components/shared/status-badges";

const MAX_RESULTS = 200;

export default async function PoLookupPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePagePermission("view.polookup");
  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";

  let lines: Prisma.ComplianceLineGetPayload<{ include: { metric: { include: { program: true } }; review: true; poRecord: true } }>[] = [];
  if (q) {
    // Exact match on any shipment identifier; PO numbers also match by prefix
    lines = await prisma.complianceLine.findMany({
      where: {
        OR: [
          { poNumber: { startsWith: q } },
          { sku: q },
          { vendorSku: q },
          { docTraceId: q },
          { tmsId: q },
          { carrierPro: q },
          { bolNumber: q },
          { trackingNumber: q },
          { customerOrder: q },
          { omsId: q },
        ],
      },
      include: { metric: { include: { program: true } }, review: true, poRecord: true },
      orderBy: [{ poNumber: "asc" }, { fiscalMonth: "desc" }, { sourceRow: "asc" }],
      take: MAX_RESULTS + 1,
    });
  }
  const truncated = lines.length > MAX_RESULTS;
  if (truncated) lines = lines.slice(0, MAX_RESULTS);

  // One group per PO record: THD reuses PO numbers, and each use has its own record
  const byPo = new Map<string, typeof lines>();
  for (const l of lines) {
    const key = l.poRecordId ?? l.poNumber ?? "(no PO number)";
    byPo.set(key, [...(byPo.get(key) ?? []), l]);
  }
  const usesOf = (poNumber: string | null) => [...byPo.values()].filter((g) => g[0].poNumber === poNumber).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PO Lookup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every imported compliance line, compliant or not, by PO number, SKU, tracking #, PRO #, BOL #, TMS shipment ID or ASN doc trace ID.
        </p>
      </div>

      <form className="flex max-w-xl gap-2" action="/po-lookup">
        <Input name="q" defaultValue={q} placeholder="e.g. 2017187685" autoFocus />
        <Button type="submit">
          <Search className="h-4 w-4 mr-1.5" />
          Search
        </Button>
      </form>

      {q && lines.length === 0 && <p className="text-sm text-gray-500">No compliance records match &quot;{q}&quot;.</p>}
      {truncated && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Showing the first {MAX_RESULTS} lines. Refine the search to see more.</p>
      )}

      {[...byPo.entries()].map(([key, poLines]) => {
        const record = poLines[0].poRecord;
        const po = poLines[0].poNumber ?? "(no PO number)";
        const violations = poLines.filter((l) => !l.isCompliant);
        const offset = violations.reduce((s, l) => s + Number(l.offsetAmount), 0);
        return (
          <Card key={key}>
            <CardHeader>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>
                    {record ? (
                      <Link href={`/po/${record.id}`} className="text-blue-600 hover:underline">
                        PO {po}
                      </Link>
                    ) : (
                      `PO ${po}`
                    )}
                  </CardTitle>
                  {usesOf(poLines[0].poNumber) > 1 && <Badge variant="warning">Reused PO number</Badge>}
                  {record && (
                    <Link href={`/po/${record.id}`} className="text-xs text-blue-600 hover:underline">
                      Open PO record
                    </Link>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {poLines.length} line(s) · {violations.length} non-compliant · {formatCurrency(offset)} offsets
                </p>
              </div>
              {record && (
                <p className="text-xs text-gray-500">
                  {[
                    record.mVendor && `M-Vendor ${record.mVendor}${record.mVendorName ? ` (${record.mVendorName.trim()})` : ""}`,
                    record.pVendor && `P-Vendor ${record.pVendor}`,
                    record.dept && `Dept ${record.dept}`,
                    record.dcNumber && `DC ${record.dcNumber}`,
                    record.poCreateDate && `Created ${formatUtcDate(record.poCreateDate)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Fiscal month", "Program · Metric", "Result", "Offset", "SKU", "Ship / check-in", "Shipment refs", "SPM status", "Review"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {poLines.map((l) => (
                      <tr key={l.id} className="border-t border-gray-200 hover:bg-gray-50 align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {fiscalLabel(l.fiscalMonth)}
                          <div className="text-xs text-gray-400">FM {l.fiscalMonth}{l.receivedMonth !== l.fiscalMonth ? ` · received ${fiscalLabel(l.receivedMonth)}` : ""}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-900">{l.metric.program.name}<div className="text-xs text-gray-500">{l.metric.name}</div></td>
                        <td className="px-4 py-3"><ComplianceBadge compliant={l.isCompliant} /></td>
                        <td className="px-4 py-3 text-gray-900">{Number(l.offsetAmount) ? formatCurrency(Number(l.offsetAmount)) : "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{l.sku ?? "—"}<div className="text-xs text-gray-500">{l.skuDescription}</div></td>
                        <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                          {l.actualShipDate && <div>Shipped {formatUtcDate(l.actualShipDate)}</div>}
                          {l.trailerCheckIn && <div>Check-in {formatUtcDateTime(l.trailerCheckIn)}</div>}
                          {l.estShipDate && <div>ESD {formatUtcDate(l.estShipDate)}</div>}
                          {!l.actualShipDate && !l.trailerCheckIn && !l.estShipDate && "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {[l.tmsId && `TMS ${l.tmsId}`, l.carrierPro && `PRO ${l.carrierPro}`, l.bolNumber && `BOL ${l.bolNumber}`, l.docTraceId && `ASN ${l.docTraceId}`, l.trackingNumber && `Trk ${l.trackingNumber}`]
                            .filter(Boolean)
                            .map((s) => <div key={s as string}>{s}</div>)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">{[l.spmStatus, l.lateReason, l.reason].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-4 py-3">{l.isCompliant ? <span className="text-gray-300">—</span> : <DispositionBadge disposition={l.review?.disposition} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!q && (
        <p className="text-sm text-gray-400">
          Tip: PO numbers match by prefix, so a partial PO shows every PO that starts with it.
          {user.permissions.has("reports.view") && (
            <>
              {" "}
              <Link href="/reports" className="text-blue-600 hover:underline">Reports</Link> show each month&apos;s violations.
            </>
          )}
        </p>
      )}
    </div>
  );
}

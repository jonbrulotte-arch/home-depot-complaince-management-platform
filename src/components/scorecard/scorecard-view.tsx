import { CheckCircle2, XCircle } from "lucide-react";
import type { ScorecardData, ScorecardShipments } from "@/lib/scorecard";
import { shipmentRows } from "@/lib/scorecard-rules";
import { formatDateRange, SHIPMENT_RANGES } from "@/lib/shipment-ranges";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { cn, formatCurrency, formatPct, formatUtcDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm";

function Result({ meets }: { meets: boolean | null }) {
  if (meets === null) return <span className="text-gray-400">—</span>;
  return meets ? (
    <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />Meets goal</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-4 w-4" />Below goal</span>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "amber" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 print:break-inside-avoid">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-xl font-bold text-gray-900", tone === "green" && "text-green-700", tone === "red" && "text-red-700", tone === "amber" && "text-amber-700")}>{value}</p>
    </div>
  );
}

/** Read-only scorecard; renders the same for drafts, published views and printing. */
export function ScorecardView({ data, showViolations = true }: { data: ScorecardData; showViolations?: boolean }) {
  const teamTotal = data.teamInfluence.reduce((s, t) => s + t.amount, 0);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">THD Compliance Scorecard: {data.periodLabel}</h2>
        <p className="text-sm text-gray-500">
          {data.periodBasis === "RECEIVED_MONTH" ? `Data received in ${data.periodLabel}` : `THD fiscal month ${data.fiscalMonth}`}
          {data.dataReceivedAt && <> · SPM data received {formatUtcDate(data.dataReceivedAt)}</>} · generated {formatUtcDate(data.generatedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Total label="Pre-dispute offsets" value={formatCurrency(data.totals.preOffset)} />
        <Total label="Recovered in disputes" value={formatCurrency(data.totals.recovered)} tone="green" />
        <Total label="Post-dispute offsets" value={formatCurrency(data.totals.postOffset)} tone={data.totals.postOffset > 0 ? "red" : undefined} />
        <Total label={`Pending (${data.totals.pendingDisputes} disputes)`} value={formatCurrency(data.totals.pendingAmount)} tone={data.totals.pendingAmount > 0 ? "amber" : undefined} />
        <Total label="Violations" value={String(data.totals.violations)} />
      </div>
      {data.historical && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Historical: built from the archived SPM exports. Violations were accepted as THD reported them; post-dispute amounts marked &quot;per THD&quot; come from THD&apos;s own summary.
        </p>
      )}
      {data.totals.pendingDisputes > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {data.totals.pendingDisputes} dispute(s) await THD&apos;s decision; post-dispute figures assume they are not approved.
        </p>
      )}

      {data.shipments && data.shipments.programs.length > 0 && <Shipments shipments={data.shipments} />}

      {data.programs.map((p) => (
        <Card key={p.code} className="print:break-inside-avoid print:shadow-none">
          <CardHeader className="flex flex-row items-baseline justify-between space-y-0 pb-3">
            <CardTitle>{p.name}</CardTitle>
            <p className="text-sm text-gray-500">
              {p.lines} {data.shipments?.programs.some((s) => s.code === p.code && s.total !== null) || (p.code === "US_TRANS" && data.shipments?.transportationLtl != null) ? "shipment(s)" : "line(s)"} · {p.violations} violation(s) · {formatCurrency(p.preOffset)} → <span className="font-medium text-gray-900">{formatCurrency(p.postOffset)}</span>
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["Metric", "Goal", "Pre-dispute", "Post-dispute", "Result", "Violations", "Pre-dispute $", "Post-dispute $"].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.metrics.map((m) => (
                    <tr key={m.code} className="border-t border-gray-200">
                      <td className={cn(td, "text-gray-900")}>{m.name}</td>
                      <td className={cn(td, "text-gray-500")}>{m.goalPct == null ? "—" : `≥ ${m.goalPct}%`}</td>
                      <td className={cn(td, "text-gray-700")}>{formatPct(m.prePct, 2)}</td>
                      <td className={cn(td, "text-gray-900")}>{formatPct(m.postPct, 2)}</td>
                      <td className={td}><Result meets={m.lines === 0 && m.violations === 0 ? true : m.meetsGoal} /></td>
                      <td className={cn(td, m.violations ? "text-red-700 font-medium" : "text-gray-400")}>
                        {m.violations}
                        {m.disputed > 0 && <span className="ml-1 text-xs font-normal text-gray-500">({m.disputed} disputed, {m.approved} approved)</span>}
                        {m.resolved ? <div className="text-xs font-normal text-gray-500">{m.resolved} cancelled / resolved, not counted</div> : null}
                      </td>
                      <td className={cn(td, "text-gray-700")}>{m.preOffset ? formatCurrency(m.preOffset) : "—"}</td>
                      <td className={cn(td, "font-medium", m.postOffset ? "text-gray-900" : "text-gray-400")}>
                        {m.postOffset ? formatCurrency(m.postOffset) : "—"}
                        {m.thdPostDispute && <div className="text-xs font-normal text-gray-500">per THD</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="print:break-inside-avoid print:shadow-none">
          <CardHeader className="pb-3"><CardTitle>Offsets by team influence</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.teamInfluence.length === 0 && <p className="text-sm text-gray-400">No violations this period.</p>}
            {data.teamInfluence.map((t) => (
              <div key={t.team}>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{t.team} <span className="text-xs text-gray-400">({t.lines})</span></span>
                  <span className="font-medium text-gray-900">{formatCurrency(t.amount)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${teamTotal ? (t.amount / teamTotal) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 print:break-inside-avoid print:shadow-none">
          <CardHeader className="pb-3"><CardTitle>12-month offsets</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className={th}>Month</th>
                    <th className={cn(th, "text-right")}>Pre-dispute</th>
                    <th className={cn(th, "text-right")}>Recovered</th>
                    <th className={cn(th, "text-right")}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((t) => (
                    <tr key={t.fiscalMonth} className={cn("border-t border-gray-200", t.fiscalMonth === data.fiscalMonth && "bg-blue-50")}>
                      <td className={cn(td, "text-gray-700")}>{t.label}</td>
                      <td className={cn(td, "text-right", t.preOffset ? "text-gray-900" : "text-gray-300")}>{t.preOffset ? formatCurrency(t.preOffset) : "—"}</td>
                      <td className={cn(td, "text-right", t.recovered ? "text-green-700" : "text-gray-300")}>{t.recovered ? formatCurrency(t.recovered) : "—"}</td>
                      <td className={cn(td, "text-right font-medium text-gray-900")}>{formatCurrency(Math.max(0, t.preOffset - t.recovered))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {showViolations && (
        <Card className="print:shadow-none">
          <CardHeader className="pb-3"><CardTitle>Violations</CardTitle></CardHeader>
          <CardContent>
            {data.violations.length === 0 ? (
              <p className="text-sm text-gray-400">No violations this period.</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Program · Metric", "PO #", "Site", "Offset", "Team", "Dispute", "Recovered", "Root cause / Notes"].map((h) => (
                        <th key={h} className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.violations.map((v, i) => (
                      <tr key={i} className="border-t border-gray-200 align-top print:break-inside-avoid">
                        <td className={cn(td, "text-gray-900")}>{v.program}<div className="text-xs text-gray-500">{v.metric}</div></td>
                        <td className={cn(td, "text-gray-900")}>{v.poNumber ?? "—"}</td>
                        <td className={cn(td, "text-gray-700")}>{v.dcNumber ?? "—"}</td>
                        <td className={cn(td, "text-gray-900")}>{formatCurrency(v.offset)}</td>
                        <td className={cn(td, "text-gray-700")}>{v.teamInfluence ?? "—"}</td>
                        <td className={td}>
                          {v.disputeStatus ? <Badge variant="outline">{DISPUTE_STATUS_LABELS[v.disputeStatus]}</Badge> : <span className="text-xs text-gray-400">Not disputed</span>}
                          {v.reasonCode && <div className="text-xs text-gray-500">{v.reasonCode}</div>}
                        </td>
                        <td className={cn(td, v.recovered ? "text-green-700" : "text-gray-400")}>{v.recovered ? formatCurrency(v.recovered) : "—"}</td>
                        <td className={cn(td, "max-w-xs text-xs text-gray-600 whitespace-pre-wrap")}>
                          {v.rootCause && <div className="font-medium text-gray-800">{v.rootCause}</div>}
                          {v.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Shipments({ shipments }: { shipments: ScorecardShipments }) {
  const count = (v: number | null) => (v === null ? <span className="text-gray-400">Not entered</span> : v.toLocaleString("en-US"));
  return (
    <Card className="print:break-inside-avoid print:shadow-none">
      <CardHeader className="flex flex-row items-baseline justify-between space-y-0 pb-3">
        <CardTitle>Shipments</CardTitle>
        <p className="text-sm text-gray-500">
          {shipments.totals.total.toLocaleString("en-US")} total
          {shipments.transportationLtl !== null && <> · {shipments.transportationLtl} RDC + DFC LTL (Transportation)</>}
        </p>
      </CardHeader>
      <CardContent>
        {shipments.ranges && (
          <dl className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {SHIPMENT_RANGES.map(({ key, label }) => (
              <div key={key} className="flex gap-2">
                <dt className="text-gray-500">{label}:</dt>
                <dd className={shipments.ranges![key] ? "text-gray-900" : "text-gray-400"}>{formatDateRange(shipments.ranges![key])}</dd>
              </div>
            ))}
          </dl>
        )}
        {!shipments.complete && <p className="mb-3 text-xs text-amber-700">Some shipment counts were not entered for this period.</p>}
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Mode</th>
                {shipments.programs.map((p) => (
                  <th key={p.code} className={cn(th, "text-right")}>{p.name}</th>
                ))}
                <th className={cn(th, "text-right")}>Total</th>
              </tr>
            </thead>
            <tbody>
              {shipmentRows(shipments).map((row, i) =>
                row.heading ? (
                  <tr key={i} className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={shipments.programs.length + 2} className={cn(td, "py-2 text-xs font-medium uppercase tracking-wider text-gray-500")}>{row.label}</td>
                  </tr>
                ) : (
                  <tr key={i} className={cn("border-t border-gray-200", row.bold && "bg-gray-50 font-semibold")}>
                    <td className={cn(td, "text-gray-900")}>{row.label}</td>
                    {row.values.map((v, n) => (
                      <td key={n} className={cn(td, "text-right text-gray-900")}>{count(v)}</td>
                    ))}
                    <td className={cn(td, "text-right text-gray-900")}>{(row.total ?? 0).toLocaleString("en-US")}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

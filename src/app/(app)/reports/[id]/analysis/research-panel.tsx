"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Plus, Truck } from "lucide-react";
import type { Disposition } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { DispositionBadge } from "@/components/shared/status-badges";
import { FlagBadges, FlagList, PoStatusBadge, ScacLink, TmsStatusBadge, UpsLink } from "@/components/logistics/parts";
import { useTimeZone } from "@/components/time-zone";
import type { ReviewIssue, ReviewLogistics, ReviewLogisticsResult } from "@/lib/review-context";
import { cn, formatCurrency, formatDateTime, formatUtcDate, formatUtcDateTime } from "@/lib/utils";

// The research beside a violation under review, in one place: the PO's logistics (WMS, TMS, UPS and
// notes), its TMS shipments, its Issue Log issues and its other violations.

export type ResearchTab = "logistics" | "shipments" | "issues" | "history";

export interface ResearchAccess {
  logistics: boolean;
  issues: boolean;
  /** May log an issue (issues.manage) */
  logIssues: boolean;
  /** May open PO records (view.polookup) */
  poRecords: boolean;
}

export interface HistoryItem {
  poNumber: string;
  fiscalMonth: number;
  label: string;
  offset: number;
  disposition: Disposition | null;
}

const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const td = "px-3 py-2 align-top text-sm";

/** A link that opens in a new tab, so the review keeps its place */
function Out({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} target="_blank" className={cn("font-medium text-blue-600 hover:underline", className)}>
      {children}
    </Link>
  );
}

export function ResearchPanel({
  poNumber,
  poRecordId,
  poCreateDate,
  logistics,
  issues,
  history,
  access,
  tab: wanted,
  onTab,
}: {
  poNumber: string | null;
  poRecordId: string | null;
  poCreateDate: string | null;
  logistics: ReviewLogisticsResult | undefined;
  issues: ReviewIssue[];
  history: HistoryItem[];
  access: ResearchAccess;
  tab: ResearchTab;
  onTab: (t: ResearchTab) => void;
}) {
  if (!poNumber) return null;
  const po = logistics?.kind === "found" ? logistics.po : null;
  const openIssues = issues.filter((i) => i.status !== "Resolved" && i.status !== "Closed").length;
  const tabs: { key: ResearchTab; label: string; count?: number; show: boolean }[] = [
    { key: "logistics", label: "Logistics", show: access.logistics },
    { key: "shipments", label: "Shipments", count: po?.shipments.length ?? 0, show: access.logistics },
    { key: "issues", label: "Issues", count: issues.length, show: access.issues },
    { key: "history", label: "Other violations", count: history.length, show: true },
  ];
  const shown = tabs.filter((t) => t.show);
  // The tab picked on an earlier line, when this one has it; else the first
  const tab = shown.some((t) => t.key === wanted) ? wanted : shown[0].key;
  const issueHref = `/issues/new?po=${encodeURIComponent(poNumber)}${poCreateDate ? `&poDate=${poCreateDate}` : ""}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">Research</p>
          {access.logistics && (po ? <PoStatusBadge status={po.status} /> : <span className="text-xs text-gray-500">Not in Logistics</span>)}
          {po && <FlagBadges flags={po.flags} max={4} />}
          {access.issues && issues.length > 0 && (
            <Badge variant={openIssues ? "warning" : "secondary"}>
              {issues.length} issue{issues.length > 1 ? "s" : ""}
              {openIssues ? ` · ${openIssues} open` : ""}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {access.poRecords && poRecordId && (
            <Out href={`/po/${poRecordId}`} className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> PO record
            </Out>
          )}
          {po && (
            <Out href={`/logistics/po/${encodeURIComponent(po.poNumber)}`} className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" /> Logistics page
            </Out>
          )}
          {access.logIssues && (
            <Out href={issueHref} className="inline-flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Log an issue
            </Out>
          )}
        </div>
      </div>
      <div className="flex gap-1 border-b border-gray-200 px-2" role="tablist">
        {shown.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => onTab(t.key)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            {t.label}
            {t.count !== undefined && <span className={cn("ml-1.5 rounded-full px-1.5 text-xs", t.count ? "bg-gray-100 text-gray-700" : "text-gray-400")}>{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "logistics" && <LogisticsTab result={logistics} />}
        {tab === "shipments" && <ShipmentsTab result={logistics} />}
        {tab === "issues" && <IssuesTab issues={issues} issueHref={access.logIssues ? issueHref : null} />}
        {tab === "history" && <HistoryTab history={history} />}
      </div>
    </div>
  );
}

function NotInLogistics({ result }: { result: ReviewLogisticsResult | undefined }) {
  if (result?.kind === "otherUse")
    return (
      <p className="text-sm text-gray-500">
        Logistics has a later use of this PO number (created {formatUtcDate(result.createdAt)}); THD reuses PO numbers, so its WMS and TMS data isn&apos;t shown for this violation.
      </p>
    );
  return <p className="text-sm text-gray-500">This PO isn&apos;t in the WMS or TMS data imported so far (the WMS report covers about the last 60 days).</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 break-words">{children}</dd>
    </div>
  );
}

function LogisticsTab({ result }: { result: ReviewLogisticsResult | undefined }) {
  const tz = useTimeZone();
  const [cartonsOpen, setCartonsOpen] = useState(false);
  if (result?.kind !== "found") return <NotInLogistics result={result} />;
  const p: ReviewLogistics = result.po;
  const shipped = p.firstShipped ? (p.lastShipped && formatUtcDate(p.lastShipped) !== formatUtcDate(p.firstShipped) ? `${formatUtcDate(p.firstShipped)} – ${formatUtcDate(p.lastShipped)}` : formatUtcDate(p.firstShipped)) : "Not shipped by the WMS";
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
        <Field label="Logistics status">
          <span className="flex flex-wrap items-center gap-1.5">
            <PoStatusBadge status={p.status} />
            {p.tmsPoStatus && <span className="text-xs text-gray-500">TMS PO: {p.tmsPoStatus}</span>}
          </span>
        </Field>
        <Field label="Ship-from">{p.origin}</Field>
        <Field label="Destination">{p.destination}</Field>
        <Field label="Shipped (WMS)">{shipped}</Field>
        <Field label="Cartons">{p.cartonCount ? `${p.cartonCount} · ${p.units.toLocaleString("en-US")} units` : "—"}</Field>
        <Field label="TMS ID on the cartons">{p.wmsTms.length ? <span className="font-mono">{p.wmsTms.join(", ")}</span> : "—"}</Field>
        {p.pros.length > 0 && (
          <Field label="PRO">
            <span className="font-mono">{p.pros.join(", ")}</span>
          </Field>
        )}
        {p.ups.length > 0 && <Field label="UPS">{p.ups.length} parcel(s)</Field>}
      </dl>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Flags</p>
        <FlagList flags={p.flags} />
      </div>

      {p.parcels.length > 0 || p.ups.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">UPS tracking</p>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Tracking #", "Status", "Last activity", "Delivered / expected"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.ups.map((n) => {
                  const x = p.parcels.find((q) => q.number === n);
                  return (
                    <tr key={n} className="border-t border-gray-200">
                      <td className={td}>
                        <UpsLink number={n} />
                      </td>
                      <td className={cn(td, "text-gray-700")}>{x?.status ?? <span className="text-gray-400">Not checked yet</span>}</td>
                      <td className={cn(td, "text-gray-700")}>{x?.lastActivity ? `${x.lastActivity}${x.lastLocation ? ` · ${x.lastLocation}` : ""}` : "—"}</td>
                      <td className={cn(td, "text-gray-700")}>{x?.delivered ? `Delivered ${formatUtcDate(x.deliveredAt)}` : x?.expectedAt ? `Expected ${formatUtcDate(x.expectedAt)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {p.cartons.length > 0 && (
        <div className="rounded-md border border-gray-200">
          <button onClick={() => setCartonsOpen(!cartonsOpen)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50">
            {cartonsOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            WMS shipped lines ({p.cartons.length}
            {p.cartons.length < p.cartonCount ? ` of ${p.cartonCount}` : ""})
          </button>
          {cartonsOpen && (
            <div className="overflow-x-auto border-t border-gray-200">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["Label / order", "Tracking", "Product", "Qty", "Shipped / ship-to"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.cartons.map((c, i) => (
                    <tr key={`${c.label}-${i}`} className="border-t border-gray-200">
                      <td className={td}>
                        <span className="font-mono text-xs text-gray-900">{c.label}</span>
                        {c.order && <p className="text-xs text-gray-500">{c.order}</p>}
                      </td>
                      <td className={cn(td, "font-mono text-xs text-gray-700")}>{c.tracking ?? "—"}</td>
                      <td className={cn(td, "text-gray-700")}>{c.product ?? "—"}</td>
                      <td className={cn(td, "text-gray-700 tabular-nums")}>{c.quantity ?? "—"}</td>
                      <td className={cn(td, "text-gray-700")}>
                        {formatUtcDateTime(c.shippedAt)}
                        {c.shipTo && <p className="text-xs text-gray-500">{c.shipTo}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Emails sent</p>
        {p.emails.length ? (
          <ul className="space-y-2">
            {p.emails.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <Out href={`/logistics/email/${e.id}`}>{e.subject}</Out>
                  <span className="block text-xs text-gray-500">
                    {formatDateTime(e.at, tz)} · {e.sender} to {e.to}
                    {e.requests.length ? ` · ${e.requests.join("; ")}` : ""}
                  </span>
                </span>
                <Badge variant={e.sent ? "success" : "destructive"}>{e.sent ? "Sent" : "Not sent"}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No emails sent from Logistics about this PO or its shipments.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Logistics notes</p>
        {p.notes.length ? (
          <ul className="space-y-2">
            {p.notes.map((n, i) => (
              <li key={i} className="rounded-md bg-gray-50 px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap text-gray-700">{n.body}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {n.author} · {formatDateTime(n.at, tz)}
                  {n.shipment ? ` · on shipment ${n.shipment}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No notes on this PO or its shipments.</p>
        )}
      </div>
    </div>
  );
}

function ShipmentsTab({ result }: { result: ReviewLogisticsResult | undefined }) {
  if (result?.kind !== "found") return <NotInLogistics result={result} />;
  const p = result.po;
  if (!p.shipments.length) return <p className="text-sm text-gray-500">No TMS shipment lists this PO{p.ups.length ? "; it went by UPS (see Logistics)" : ""}.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            {["Shipment", "Carrier", "Pickup / delivery", "Route", "POs", "Flags"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.shipments.map((s) => (
            <tr key={s.number} className="border-t border-gray-200">
              <td className={td}>
                <Out href={`/logistics/shipment/${encodeURIComponent(s.number)}`}>{s.number}</Out>
                <div className="mt-1">
                  <TmsStatusBadge status={s.status} />
                </div>
                {s.tmsStatus && <p className="mt-0.5 text-xs text-gray-500">TMS: {s.tmsStatus}</p>}
              </td>
              <td className={td}>
                <ScacLink scac={s.scac} url={s.scacUrl} known={s.scacKnown} was={s.tmsScac} />
              </td>
              <td className={cn(td, "text-xs text-gray-700")}>
                <p>Pickup {s.pickup ?? "?"}</p>
                <p>Delivery {s.delivery ?? "?"}</p>
                {s.appointment && <p className="text-gray-500">Stops: {s.appointment}</p>}
              </td>
              <td className={cn(td, "text-xs text-gray-700")}>
                <p>From {s.from}</p>
                <p>To {s.to}</p>
              </td>
              <td className={cn(td, "text-xs text-gray-700")}>
                {s.ourPos.map((po, i) => (
                  <span key={po}>
                    {i > 0 && ", "}
                    <span className={po === p.poNumber ? "font-semibold text-gray-900" : undefined}>{po}</span>
                  </span>
                ))}
                {s.otherPos > 0 && <p className="text-gray-500">+{s.otherPos} other supplier PO(s)</p>}
                {s.cartonCount > 0 && <p className="text-gray-500">{s.cartonCount} carton(s)</p>}
              </td>
              <td className={td}>
                <FlagBadges flags={s.flags} withInfo max={4} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssuesTab({ issues, issueHref }: { issues: ReviewIssue[]; issueHref: string | null }) {
  if (!issues.length)
    return (
      <p className="text-sm text-gray-500">
        No issues logged for this PO.{" "}
        {issueHref && (
          <Out href={issueHref} className="font-normal">
            Log an issue
          </Out>
        )}
      </p>
    );
  return (
    <ul className="space-y-3">
      {issues.map((i) => (
        <li key={i.id} className="rounded-md border border-gray-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm">
              <Out href={`/issues/${i.id}`}>{i.label}</Out> <span className="font-medium text-gray-900">{i.title}</span>
            </p>
            <Badge variant={i.statusVariant}>{i.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {[formatUtcDate(i.date), i.category, `${i.severity} severity`, i.team, i.poCount > 1 ? `${i.poCount} POs` : null, i.estimatedFine !== null ? `est. max fine ${formatCurrency(i.estimatedFine)}` : null, i.tickets.length ? `HD Support ${i.tickets.join(", ")}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{i.description}</p>
          {i.resolution && (
            <p className="mt-2 text-sm text-gray-700">
              <span className="font-medium text-gray-900">Resolution: </span>
              {i.resolution}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function HistoryTab({ history }: { history: HistoryItem[] }) {
  if (!history.length) return <p className="text-sm text-gray-500">No other violations on this PO.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {history.map((h, i) => (
        <li key={i} className="flex items-center justify-between gap-2">
          <span className="text-gray-700">
            FM {h.fiscalMonth} · {h.label}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-gray-900">{formatCurrency(h.offset)}</span>
            <DispositionBadge disposition={h.disposition} />
          </span>
        </li>
      ))}
    </ul>
  );
}

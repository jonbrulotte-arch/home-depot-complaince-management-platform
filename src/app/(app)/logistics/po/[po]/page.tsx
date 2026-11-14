import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { issuesForPoNumbers, type IssueSummary } from "@/lib/issues-data";
import { loadLogistics, scacLink } from "@/lib/logistics/data";
import { complianceForPos } from "@/lib/logistics/links";
import { upsConfigured } from "@/lib/logistics/ups";
import { cartonRefs } from "@/lib/logistics/refs";
import { formatDateTime, formatUtcDate, formatUtcDateTime } from "@/lib/utils";
import { getTimeZone } from "@/lib/time-zone-server";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlagList, PoStatusBadge, ScacLink, ShipmentLink, TmsStatusBadge, UpsLink } from "@/components/logistics/parts";
import { LogisticsNotes } from "@/components/logistics/notes";
import { ComplianceCard, IssuesCard } from "@/components/logistics/related";
import { Section, Table, n } from "@/app/(app)/insights/ui";
import { UpsRefreshButton } from "../../ups-refresh-button";

export default async function LogisticsPoPage({ params }: { params: Promise<{ po: string }> }) {
  const user = await requirePagePermission("logistics.view");
  const po = decodeURIComponent((await params).po).trim().toUpperCase();
  const [l, tz] = await Promise.all([loadLogistics(), getTimeZone()]);
  const p = l.pos.find((x) => x.poNumber === po);
  if (!p) notFound();
  const canIssues = user.permissions.has("issues.view");
  const [issues, compliance, notes] = await Promise.all([
    canIssues ? issuesForPoNumbers([po]) : new Map<string, IssueSummary[]>(),
    complianceForPos([po]),
    prisma.logisticsNote.findMany({ where: { poNumber: po }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }),
  ]);
  const tracking = new Map(p.parcels.map((x) => [x.trackingNumber, x]));
  const orders = [...new Set(p.cartons.map((c) => c.orderNum))];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Link href="/logistics?tab=pos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" />
        Logistics
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">PO {p.poNumber}</h1>
        <PoStatusBadge status={p.status} />
        {p.tms && <span className="text-sm text-gray-500">TMS: {p.tms.status}</span>}
      </div>
      <StatTiles
        stats={[
          { label: "Ship-from", value: p.origin.split(" · ")[1] ?? p.origin, hint: p.origin.split(" · ")[0] },
          { label: "Destination", value: p.destination.split(" · ")[1] ?? p.destination, hint: p.destination.includes(" · ") ? `DC ${p.destination.split(" · ")[0]}` : undefined },
          { label: "Shipped (WMS)", value: p.firstShipped ? formatUtcDate(p.firstShipped) : "—", hint: p.lastShipped && p.firstShipped && p.lastShipped.getTime() !== p.firstShipped.getTime() ? `last ${formatUtcDate(p.lastShipped)}` : undefined },
          { label: "Cartons", value: n(p.cartonCount), hint: `${n(p.units)} units` },
          { label: "TMS shipments", value: n(p.shipments.length) },
          { label: "WMS orders", value: n(orders.length), hint: orders.slice(0, 3).join(", ") + (orders.length > 3 ? "…" : "") },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <FlagList flags={p.flags} />
            </CardContent>
          </Card>
          <Section title="TMS shipments" description="Click the SCAC to open the carrier's tracking page.">
            <Table
              rows={p.shipments}
              empty="No TMS shipment lists this PO."
              cols={[
                { header: "Shipment #", cell: (s) => <ShipmentLink number={s.shipmentNumber} /> },
                { header: "Status", cell: (s) => <TmsStatusBadge status={s.status} /> },
                { header: "SCAC", cell: (s) => <ScacLink scac={s.scac} {...(s.scac ? scacLink(l, s.scac, { shipment: s.shipmentNumber, po: p.poNumber, pro: p.pros[0] }) : {})} /> },
                { header: "Pickup", cell: (s) => s.pickupLocal ?? "—" },
                { header: "Delivery", cell: (s) => s.deliveryLocal ?? "—" },
                { header: "Route", cell: (s) => `${[s.originCity, s.originState].filter(Boolean).join(", ")} → ${[s.destFacility, s.destCity].filter(Boolean).join(" ")}` },
                { header: "Stops / appointment", cell: (s) => <span className="text-xs text-gray-600">{s.appointment ?? "—"}</span> },
              ]}
            />
          </Section>
          {p.ups.length > 0 && (
            <Section title="UPS parcels" action={upsConfigured() ? <UpsRefreshButton numbers={p.ups.slice(0, 50)} label="Refresh" /> : undefined}>
              <Table
                rows={p.ups}
                cols={[
                  { header: "Tracking #", cell: (u) => <UpsLink number={u} /> },
                  { header: "Status", cell: (u) => tracking.get(u)?.status ?? tracking.get(u)?.error ?? <span className="text-gray-400">Not checked</span> },
                  { header: "Last activity", cell: (u) => { const t = tracking.get(u); return t?.lastActivity ? `${t.lastActivity}${t.lastLocation ? ` · ${t.lastLocation}` : ""}` : "—"; } },
                  { header: "Delivered / expected", cell: (u) => { const t = tracking.get(u); return t?.deliveredAt ? formatUtcDateTime(t.deliveredAt) : t?.expectedAt ? `Expected ${formatUtcDate(t.expectedAt)}` : "—"; } },
                  { header: "Checked", cell: (u) => (tracking.get(u)?.checkedAt ? formatDateTime(tracking.get(u)!.checkedAt!, tz) : "—") },
                ]}
              />
            </Section>
          )}
          <Section title="WMS cartons" description={p.cartons.length ? `${n(p.cartonCount)} carton(s), ${n(p.cartons.length)} line(s) from the WMS shipped-lines report (a mixed carton has a line per product).` : undefined}>
            <Table
              rows={p.cartons}
              empty="The WMS hasn't shipped this PO (or it's older than the reports imported)."
              cols={[
                { header: "Label (GS1-128)", cell: (c) => <span className="font-mono text-xs">{c.label}</span> },
                { header: "Order", cell: (c) => c.orderNum },
                { header: "Tracking", cell: (c) => { const r = cartonRefs(c.trackingNumber, c.secondTrack); return r.ups ? <UpsLink number={r.ups} /> : <span className="font-mono text-xs">{[c.trackingNumber, c.secondTrack !== c.trackingNumber ? c.secondTrack : null].filter(Boolean).join(" / ") || "—"}</span>; } },
                { header: "Product", cell: (c) => c.product ?? "—" },
                { header: "Qty", cell: (c) => (c.quantity === null ? "—" : n(c.quantity)), align: "right" },
                { header: "Shipped", cell: (c) => <span className="whitespace-nowrap">{formatUtcDateTime(c.shippedAt)}</span> },
                { header: "Ship-to", cell: (c) => [c.shipCity, c.shipState, c.shipZip].filter(Boolean).join(", ") || "—" },
              ]}
            />
          </Section>
        </div>
        <div className="space-y-6">
          {canIssues && <IssuesCard issues={issues.get(po) ?? []} newIssuePo={po} canManage={user.permissions.has("issues.manage")} />}
          <ComplianceCard rows={compliance.get(po) ?? []} canOpen={user.permissions.has("view.polookup")} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <LogisticsNotes
                target={{ poNumber: po }}
                userId={user.id}
                canManage={user.permissions.has("logistics.manage")}
                notes={notes.map((x) => ({ id: x.id, body: x.body, author: x.author?.name ?? null, authorId: x.authorId, createdAt: x.createdAt.toISOString() }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

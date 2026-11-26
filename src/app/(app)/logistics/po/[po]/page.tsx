import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { issuesForPoNumbers, type IssueSummary } from "@/lib/issues-data";
import { loadLogistics, scacLink } from "@/lib/logistics/data";
import { complianceForPos } from "@/lib/logistics/links";
import { upsConfigured } from "@/lib/logistics/ups";
import { cartonRefs } from "@/lib/logistics/refs";
import { formatDate, formatDateTime, formatUtcDate, formatUtcDateTime } from "@/lib/utils";
import { getTimeZone } from "@/lib/time-zone-server";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AsnBadge, FlagList, PoStatusBadge, ScacLink, ShipmentLink, TmsStatusBadge, UpsLink } from "@/components/logistics/parts";
import { LogisticsNotes } from "@/components/logistics/notes";
import { ComplianceCard, IssuesCard } from "@/components/logistics/related";
import { EmailsCard } from "@/components/logistics/emails";
import { warehouseNames } from "@/lib/logistics/warehouses";
import { addressLines } from "@/lib/logistics/ship-to";
import { pomDestination, type PomPo } from "@/lib/logistics/views";
import { pomByPoNumbers } from "@/lib/pom-data";
import { Section, Table, n } from "@/app/(app)/insights/ui";
import { UpsRefreshButton } from "../../ups-refresh-button";
import { Dates, Route } from "../../sections";

export default async function LogisticsPoPage({ params }: { params: Promise<{ po: string }> }) {
  const user = await requirePagePermission("logistics.view");
  const po = decodeURIComponent((await params).po).trim().toUpperCase();
  const [l, tz] = await Promise.all([loadLogistics(), getTimeZone()]);
  const p = l.pos.find((x) => x.poNumber === po);
  if (!p) {
    // A PO only POM has (its Closed or Cancelled history isn't listed in Logistics): its POM record
    const pom = (await pomByPoNumbers([po])).get(po.replace(/^0+(?=\d)/, ""));
    if (!pom) notFound();
    return <PomOnlyPo pom={pom} canIssues={user.permissions.has("issues.view")} canIssuesManage={user.permissions.has("issues.manage")} canLookup={user.permissions.has("view.polookup")} />;
  }
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
        {p.asn?.status === "SHIPPED" && <AsnBadge inline date={p.asn.confirmedAt ? formatDate(p.asn.confirmedAt, tz) : null} />}
        {p.tms && <span className="text-sm text-gray-500">TMS: {p.tms.status}</span>}
        {p.warehouses.length > 0 && <span className="text-sm text-gray-500">Shipped from {warehouseNames(p.warehouses)}</span>}
        {user.permissions.has("packingslips.use") && (
          <Link
            href={`/packing-slips?po=${encodeURIComponent(p.poNumber)}`}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <PackageCheck className="h-4 w-4" />
            Packing slip
          </Link>
        )}
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
          {p.pom && <PomSection pom={p.pom} wmsUnits={unitsByProduct(p.cartons)} />}
          <Section title="TMS shipments" description="Click the SCAC to open the carrier's tracking page.">
            <Table
              rows={p.shipments}
              empty="No TMS shipment lists this PO."
              cols={[
                { header: "Shipment #", cell: (s) => <ShipmentLink number={s.shipmentNumber} /> },
                { header: "Status", cell: (s) => <TmsStatusBadge status={s.status} /> },
                { header: "SCAC", cell: (s) => <ScacLink scac={s.scac} was={s.tmsScac} {...(s.scac ? scacLink(l, s.scac, { shipment: s.shipmentNumber, po: p.poNumber, pro: p.pros[0], ups: p.ups[0] }) : {})} /> },
                { header: "Pickup / delivery", cell: (s) => <Dates pickup={s.pickupLocal} delivery={s.deliveryLocal} /> },
                {
                  header: "Route / stops",
                  cell: (s) => (
                    <>
                      <Route from={[s.originCity, s.originState].filter(Boolean).join(", ")} to={[s.destFacility, [s.destCity, s.destState].filter(Boolean).join(", ")].filter(Boolean).join(" · ")} />
                      {s.appointment && (
                        <span className="mt-1 block text-xs text-gray-500">
                          {s.appointment.split(/,\s*(?=Stop)/).map((x, i) => (
                            <span key={i} className="block">
                              {x}
                            </span>
                          ))}
                        </span>
                      )}
                    </>
                  ),
                },
              ]}
            />
          </Section>
          {p.ups.length > 0 && (
            <Section title="UPS parcels" action={(await upsConfigured()) ? <UpsRefreshButton numbers={p.ups.slice(0, 50)} label="Refresh" /> : undefined}>
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
                { header: "Label / order", cell: (c) => <span className="block text-xs"><span className="font-mono text-gray-900">{c.label}</span><span className="block text-gray-500">{c.orderNum}</span></span> },
                { header: "Tracking", cell: (c) => { const r = cartonRefs(c.trackingNumber, c.secondTrack); return r.ups ? <UpsLink number={r.ups} /> : <span className="font-mono text-xs">{[c.trackingNumber, c.secondTrack !== c.trackingNumber ? c.secondTrack : null].filter(Boolean).join(" / ") || "—"}</span>; } },
                { header: "Product", cell: (c) => c.product ?? "—" },
                { header: "Qty", cell: (c) => (c.quantity === null ? "—" : n(c.quantity)), align: "right" },
                { header: "Shipped / ship-to", cell: (c) => <span className="block text-xs"><span className="block whitespace-nowrap text-gray-900">{formatUtcDateTime(c.shippedAt)}</span><span className="text-gray-500">{[c.shipTo ? `#${c.shipTo}` : null, c.shipCity, c.shipState, c.shipZip].filter(Boolean).join(", ") || "—"}</span></span> },
              ]}
            />
          </Section>
        </div>
        <div className="space-y-6">
          {p.shipTo && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Ship-to (WMS)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5 text-sm text-gray-700">
                {p.shipTo.facility && <p className="font-medium text-gray-900">Store/DC #{p.shipTo.facility}</p>}
                {p.shipTo.name && <p>{p.shipTo.name}</p>}
                {addressLines(p.shipTo).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </CardContent>
            </Card>
          )}
          {canIssues && <IssuesCard issues={issues.get(po) ?? []} newIssuePo={po} canManage={user.permissions.has("issues.manage")} />}
          <EmailsCard po={po} tz={tz} />
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

function unitsByProduct(cartons: { product: string | null; quantity: number | null }[]) {
  const m = new Map<string, number>();
  for (const c of cartons) if (c.product) m.set(c.product.trim(), (m.get(c.product.trim()) ?? 0) + (c.quantity ?? 0));
  return m;
}

const money = (v: number | null, digits = 2) => (v === null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }));

/** The PO as THD's POM (Supplier Hub) shows it: status, dates, destination and its SKU lines against the WMS */
function PomSection({ pom, wmsUnits }: { pom: PomPo; wmsUnits: Map<string, number> }) {
  const dest = pomDestination(pom);
  return (
    <Section
      title="POM (Supplier Hub)"
      description={
        <>
          <span className="font-medium text-gray-700">{pom.status}</span>
          {pom.status.toLowerCase() === "shipped" && " (THD has the ASN)"} · Created {pom.poCreateDate ?? "—"} · DC due {pom.dcDueDate ?? "—"} · Destination {dest ?? "—"}
          {pom.crossDock ? ` (${pom.crossDock} crossdock via ${pom.destinationDc ?? "—"})` : ""}
          {pom.buyer ? ` · Buyer ${pom.buyer}` : ""} · {n(pom.totalQty ?? 0)} units, {money(pom.totalCost)}
        </>
      }
    >
      <Table
        rows={pom.lines}
        empty="POM listed no SKU lines."
        cols={[
          { header: "Home Depot SKU", cell: (l) => <span className="font-mono text-xs">{l.thdSku ?? "—"}</span> },
          { header: "Our SKU", cell: (l) => <span className="font-mono text-xs">{l.partNumber ?? "—"}</span> },
          { header: "Description", cell: (l) => <span className="text-xs">{l.description ?? "—"}</span> },
          { header: "Status", cell: (l) => <span className={/^cancel/i.test(l.status ?? "") ? "text-xs font-medium text-red-700" : "text-xs"}>{l.status ?? "—"}</span> },
          { header: "Ordered", cell: (l) => (l.adjOrderQty ?? l.orderQty) ?? "—", align: "right" },
          { header: "Shipped (POM)", cell: (l) => l.shippedQty ?? "—", align: "right" },
          {
            header: "Shipped (WMS)",
            cell: (l) => {
              const u = l.partNumber ? wmsUnits.get(l.partNumber.trim()) : undefined;
              const off = u !== undefined && l.shippedQty !== null && /^shipped$/i.test(l.status ?? "") && u !== l.shippedQty;
              return <span className={off ? "font-medium text-amber-700" : undefined}>{u ?? "—"}</span>;
            },
            align: "right",
          },
          { header: "Received", cell: (l) => l.receivedQty ?? "—", align: "right" },
          { header: "Unit cost", cell: (l) => money(l.unitCost), align: "right" },
        ]}
      />
    </Section>
  );
}

/** A PO that only POM has: what POM shows, with its compliance data and issues */
async function PomOnlyPo({ pom, canIssues, canIssuesManage, canLookup }: { pom: PomPo; canIssues: boolean; canIssuesManage: boolean; canLookup: boolean }) {
  const [issues, compliance] = await Promise.all([canIssues ? issuesForPoNumbers([pom.poNumber]) : new Map<string, IssueSummary[]>(), complianceForPos([pom.poNumber])]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Link href="/logistics?tab=pos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" />
        Logistics
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">PO {pom.poNumber}</h1>
        <span className="text-sm text-gray-500">POM: {pom.status}. The WMS and TMS data imported so far don&apos;t have this PO, so Logistics shows what POM has.</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PomSection pom={pom} wmsUnits={new Map()} />
        </div>
        <div className="space-y-6">
          {canIssues && <IssuesCard issues={issues.get(pom.poNumber) ?? []} newIssuePo={pom.poNumber} canManage={canIssuesManage} />}
          <ComplianceCard rows={compliance.get(pom.poNumber) ?? []} canOpen={canLookup} />
        </div>
      </div>
    </div>
  );
}

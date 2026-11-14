import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { issuesForPoNumbers, type IssueSummary } from "@/lib/issues-data";
import { loadLogistics, scacLink } from "@/lib/logistics/data";
import { complianceForPos } from "@/lib/logistics/links";
import { formatUtcDateTime } from "@/lib/utils";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlagBadges, FlagList, PoLink, PoStatusBadge, TmsStatusBadge } from "@/components/logistics/parts";
import { LogisticsNotes } from "@/components/logistics/notes";
import { ComplianceCard, IssuesCard } from "@/components/logistics/related";
import { Section, Table, n } from "@/app/(app)/insights/ui";

export default async function LogisticsShipmentPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requirePagePermission("logistics.view");
  const number = decodeURIComponent((await params).number).trim();
  const l = await loadLogistics();
  const s = l.shipments.find((x) => x.shipmentNumber === number);
  if (!s) notFound();
  const canIssues = user.permissions.has("issues.view");
  const poViews = new Map(l.pos.map((p) => [p.poNumber, p]));
  const [issues, compliance, notes] = await Promise.all([
    canIssues ? issuesForPoNumbers(s.poNumbers) : new Map<string, IssueSummary[]>(),
    complianceForPos(s.poNumbers),
    prisma.logisticsNote.findMany({ where: { shipmentNumber: number }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }),
  ]);
  const link = s.scac ? scacLink(l, s.scac, { shipment: s.shipmentNumber, po: s.poNumbers[0], pro: s.pros[0] }) : null;
  const carrier = s.scac ? l.carrierBy.get(s.scac) : undefined;
  const ours = s.poNumbers.filter((po) => poViews.has(po));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Link href="/logistics?tab=shipments" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" />
        Logistics
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">TMS shipment {s.shipmentNumber}</h1>
        <TmsStatusBadge status={s.status} />
        {link?.url ? (
          <Button asChild size="sm" variant="outline">
            <a href={link.url} target="_blank" rel="noreferrer">
              Open {carrier?.name ?? s.scac} tracking
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </a>
          </Button>
        ) : s.scac && user.permissions.has("logistics.manage") ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/logistics?tab=carriers&add=${encodeURIComponent(s.scac)}`}>Add a tracking page for {s.scac}</Link>
          </Button>
        ) : null}
      </div>
      <StatTiles
        stats={[
          { label: "Carrier", value: s.scac ?? "None", hint: carrier ? `${carrier.name}${carrier.mode ? ` · ${carrier.mode}` : ""}${carrier.trackingUrl ? "" : " · no tracking page"}` : s.scac ? "Not in the carrier list yet" : undefined },
          { label: "Pickup", value: s.pickupLocal ?? "—" },
          { label: "Delivery", value: s.deliveryLocal ?? "—" },
          { label: "From", value: [s.originCity, s.originState].filter(Boolean).join(", ") || "—", hint: s.originFacility ?? undefined },
          { label: "To", value: [s.destCity, s.destState].filter(Boolean).join(", ") || "—", hint: s.destFacility ? `DC ${s.destFacility}` : undefined },
          { label: "Cartons (WMS)", value: n(s.cartonCount), hint: s.pros.length ? `PRO ${s.pros.join(", ")}` : `${n(s.units)} units` },
        ]}
      />
      {s.appointment && <p className="text-sm text-gray-600">Stops / appointments: {s.appointment}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <FlagList flags={s.flags} />
            </CardContent>
          </Card>
          <Section title="Purchase orders" description={ours.length < s.poNumbers.length ? "POs not in your TMS purchase orders belong to other suppliers sharing the truck." : undefined}>
            <Table
              rows={s.poNumbers}
              empty="TMS lists no POs on this shipment."
              cols={[
                { header: "PO #", cell: (po) => (poViews.has(po) ? <PoLink po={po} /> : <span className="text-gray-500">{po}</span>) },
                { header: "Status", cell: (po) => (poViews.get(po) ? <PoStatusBadge status={poViews.get(po)!.status} /> : <span className="text-xs text-gray-400">Other supplier</span>) },
                { header: "TMS PO", cell: (po) => poViews.get(po)?.tms?.status ?? "—" },
                { header: "Cartons", cell: (po) => (poViews.get(po)?.cartonCount ? n(poViews.get(po)!.cartonCount) : "—"), align: "right" },
                { header: "Flags", cell: (po) => (poViews.get(po) ? <FlagBadges flags={poViews.get(po)!.flags} /> : "") },
              ]}
            />
          </Section>
          <Section title="WMS cartons">
            <Table
              rows={s.cartons}
              empty="No WMS cartons carry this shipment number."
              cols={[
                { header: "Label (GS1-128)", cell: (c) => <span className="font-mono text-xs">{c.label}</span> },
                { header: "PO", cell: (c) => <PoLink po={c.poNumber} /> },
                { header: "Order", cell: (c) => c.orderNum },
                { header: "Product", cell: (c) => c.product ?? "—" },
                { header: "Qty", cell: (c) => (c.quantity === null ? "—" : n(c.quantity)), align: "right" },
                { header: "Shipped", cell: (c) => formatUtcDateTime(c.shippedAt) },
              ]}
            />
          </Section>
        </div>
        <div className="space-y-6">
          {canIssues && (
            <IssuesCard
              issues={[
                // One row per issue, with the shipment's POs it lists
                ...ours
                  .flatMap((po) => (issues.get(po) ?? []).map((i) => ({ ...i, po })))
                  .reduce((m, i) => m.set(i.id, { ...i, pos: [...(m.get(i.id)?.pos ?? []), i.po] }), new Map<string, IssueSummary & { pos: string[] }>())
                  .values(),
              ]}
              newIssuePo={ours.length === 1 ? ours[0] : null}
              canManage={user.permissions.has("issues.manage")}
            />
          )}
          <ComplianceCard rows={ours.flatMap((po) => (compliance.get(po) ?? []).map((r) => ({ ...r, po })))} canOpen={user.permissions.has("view.polookup")} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <LogisticsNotes
                target={{ shipmentNumber: number }}
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

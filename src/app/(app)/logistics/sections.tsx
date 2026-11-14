import Link from "next/link";
import { formatDateTime, formatUtcDate, formatUtcDateTime } from "@/lib/utils";
import { LOGISTICS_KIND_LABELS } from "@/lib/logistics/parse";
import { scacLink, type LoadedLogistics } from "@/lib/logistics/data";
import { filterPos, logisticsOverview, type PoFilters, PO_STATUSES } from "@/lib/logistics/views";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { FlagBadges, PoLink, PoStatusBadge, ScacLink, ShipmentLink, TmsStatusBadge, UpsLink } from "@/components/logistics/parts";
import { Section, Table, n } from "@/app/(app)/insights/ui";
import { PoFiltersBar } from "./po-filters";
import { UpsRefreshButton } from "./ups-refresh-button";

// The Logistics tabs. Each takes the loaded views (src/lib/logistics/data.ts).

const PAGE = 300;
const day = (d: Date | null) => (d ? formatUtcDate(d) : "—");

export function OverviewTab({ l }: { l: LoadedLogistics }) {
  const o = logisticsOverview(l);
  const count = (s: string) => o.byStatus.find((b) => b.status === s)?.count ?? 0;
  return (
    <div className="space-y-6">
      <StatTiles
        stats={[
          { label: "POs", value: n(o.pos), hint: `${count("Open")} open · ${count("Canceled")} canceled` },
          { label: "Needs attention", value: n(o.withHigh), tone: o.withHigh ? "text-red-700" : undefined, hint: "POs with a high flag" },
          { label: "Worth a look", value: n(o.withMedium), tone: o.withMedium ? "text-amber-700" : undefined, hint: "POs with a medium flag" },
          { label: "Shipped, not delivered", value: n(count("Shipped") + count("In transit")) },
          { label: "Delivered", value: n(count("Delivered")), tone: "text-green-700" },
          { label: "Open TMS shipments", value: n(o.openShipments), hint: `of ${n(o.shipments)} shipments` },
        ]}
      />
      <Section title="What's flagged" description="POs with each flag. Click one to list them.">
        <Table
          rows={o.flags}
          empty="Nothing flagged."
          cols={[
            { header: "Flag", cell: (f) => <Link href={`/logistics?tab=pos&flag=${f.code}`} className="font-medium text-blue-600 hover:underline">{f.label}</Link> },
            { header: "Priority", cell: (f) => (f.severity === "high" ? <span className="text-red-700">High</span> : f.severity === "medium" ? <span className="text-amber-700">Medium</span> : <span className="text-gray-500">Info</span>) },
            { header: "POs", cell: (f) => n(f.pos), align: "right" },
          ]}
          bar={{ header: "POs", value: (f) => f.pos }}
        />
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="By carrier" description="TMS shipments by SCAC (canceled left out).">
          <Table
            rows={o.carriers}
            empty="No TMS shipments imported."
            cols={[
              { header: "SCAC", cell: (c) => (c.scac === "—" ? "None assigned" : <ScacLink scac={c.scac} {...scacLink(l, c.scac, {})} />) },
              { header: "Shipments", cell: (c) => n(c.shipments), align: "right" },
              { header: "Delivered", cell: (c) => n(c.delivered), align: "right" },
              { header: "Open", cell: (c) => n(c.open), align: "right" },
              { header: "Late or not picked up", cell: (c) => (c.overdue ? <Link href={`/logistics?tab=shipments&scac=${c.scac}&late=1`} className="text-red-700 hover:underline">{n(c.overdue)}</Link> : "—"), align: "right" },
            ]}
          />
        </Section>
        <Section title="By destination" description="THD DCs, the most flagged first.">
          <Table
            rows={o.destinations}
            empty="No POs yet."
            cols={[
              { header: "Destination", cell: (d) => <span className="text-gray-900">{d.dest}</span> },
              { header: "POs", cell: (d) => n(d.pos), align: "right" },
              { header: "Units", cell: (d) => n(d.units), align: "right" },
              { header: "High flags", cell: (d) => (d.flagged ? <span className="text-red-700">{n(d.flagged)}</span> : "—"), align: "right" },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}

export function PosTab({ l, filters, notes }: { l: LoadedLogistics; filters: PoFilters; notes: Map<string, number> }) {
  const o = logisticsOverview(l);
  const rows = filterPos(l.pos, filters);
  const scacs = [...new Set(l.shipments.map((s) => s.scac).filter((s): s is string => Boolean(s)))].sort();
  return (
    <div className="space-y-4">
      <PoFiltersBar filters={filters} statuses={PO_STATUSES} flags={o.flags.map((f) => ({ code: f.code, label: f.label, pos: f.pos }))} scacs={scacs} />
      <Section title={`${n(rows.length)} PO(s)`} description={rows.length > PAGE ? `Showing the latest ${PAGE}; narrow the search or export to Excel for all of them.` : "Latest shipped first."}>
        <Table
          rows={rows.slice(0, PAGE)}
          empty="No POs match."
          cols={[
            { header: "PO #", cell: (p) => <PoLink po={p.poNumber} /> },
            { header: "Status", cell: (p) => <PoStatusBadge status={p.status} /> },
            { header: "Destination", cell: (p) => <span className="whitespace-nowrap">{p.destination}</span> },
            { header: "Shipped (WMS)", cell: (p) => <span className="whitespace-nowrap">{day(p.firstShipped)}</span> },
            { header: "Cartons", cell: (p) => (p.cartonCount ? `${n(p.cartonCount)} · ${n(p.units)} u` : "—"), align: "right" },
            {
              header: "TMS shipment",
              cell: (p) =>
                p.shipments.length ? (
                  <span className="space-y-0.5">
                    {p.shipments.map((s) => (
                      <span key={s.shipmentNumber} className="flex items-center gap-1.5 whitespace-nowrap">
                        <ShipmentLink number={s.shipmentNumber} />
                        <ScacLink scac={s.scac} {...(s.scac ? scacLink(l, s.scac, { shipment: s.shipmentNumber, po: p.poNumber, pro: p.pros[0] }) : {})} />
                        <TmsStatusBadge status={s.status} />
                      </span>
                    ))}
                  </span>
                ) : p.ups.length ? (
                  <span className="space-y-0.5">
                    {p.ups.slice(0, 2).map((u) => (
                      <span key={u} className="block">
                        <UpsLink number={u} />
                      </span>
                    ))}
                    {p.ups.length > 2 && <span className="text-xs text-gray-500">+{p.ups.length - 2} more</span>}
                  </span>
                ) : (
                  "—"
                ),
            },
            { header: "Flags", cell: (p) => <FlagBadges flags={p.flags} /> },
            { header: "Notes", cell: (p) => (notes.get(p.poNumber) ? n(notes.get(p.poNumber)!) : ""), align: "right" },
          ]}
        />
      </Section>
    </div>
  );
}

export function ShipmentsTab({ l, scac, late }: { l: LoadedLogistics; scac?: string; late?: boolean }) {
  const rows = l.shipments.filter((s) => (!scac || s.scac === scac) && (!late || s.flags.some((f) => f.code === "DELIVERY_OVERDUE" || f.code === "PICKUP_PASSED")));
  return (
    <Section
      title={`${n(rows.length)} TMS shipment(s)${scac ? ` · ${scac}` : ""}${late ? " · late or not picked up" : ""}`}
      description={
        <>
          Latest pickup first. Click a SCAC to open the carrier&apos;s tracking page.{" "}
          {(scac || late) && (
            <Link href="/logistics?tab=shipments" className="text-blue-600 hover:underline">
              Show all
            </Link>
          )}
        </>
      }
    >
      <Table
        rows={rows.slice(0, PAGE)}
        empty="No TMS shipments imported yet."
        cols={[
          { header: "Shipment #", cell: (s) => <ShipmentLink number={s.shipmentNumber} /> },
          { header: "Status", cell: (s) => <TmsStatusBadge status={s.status} /> },
          { header: "SCAC", cell: (s) => <ScacLink scac={s.scac} {...(s.scac ? scacLink(l, s.scac, { shipment: s.shipmentNumber, po: s.poNumbers[0], pro: s.pros[0] }) : {})} /> },
          { header: "Pickup", cell: (s) => <span className="whitespace-nowrap">{s.pickupLocal ?? "—"}</span> },
          { header: "Delivery", cell: (s) => <span className="whitespace-nowrap">{s.deliveryLocal ?? "—"}</span> },
          { header: "From", cell: (s) => <span className="whitespace-nowrap">{[s.originCity, s.originState].filter(Boolean).join(", ") || "—"}</span> },
          { header: "To", cell: (s) => <span className="whitespace-nowrap">{[s.destFacility, [s.destCity, s.destState].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}</span> },
          { header: "POs", cell: (s) => (s.poNumbers.length > 2 ? `${s.poNumbers.slice(0, 2).join(", ")} +${s.poNumbers.length - 2}` : s.poNumbers.join(", ") || "—") },
          { header: "Cartons", cell: (s) => (s.cartonCount ? n(s.cartonCount) : "—"), align: "right" },
          { header: "Flags", cell: (s) => <FlagBadges flags={s.flags} /> },
        ]}
      />
    </Section>
  );
}

export function ParcelsTab({ l, upsReady, canManage, tz }: { l: LoadedLogistics; upsReady: boolean; canManage: boolean; tz: string }) {
  const parcels = new Map<string, { number: string; pos: string[]; shipped: Date | null }>();
  for (const p of l.pos)
    for (const u of p.ups) {
      const g = parcels.get(u) ?? { number: u, pos: [], shipped: null };
      g.pos.push(p.poNumber);
      const c = p.cartons.find((c) => c.trackingNumber?.toUpperCase() === u || c.secondTrack?.toUpperCase() === u);
      if (c && (!g.shipped || c.shippedAt < g.shipped)) g.shipped = c.shippedAt;
      parcels.set(u, g);
    }
  const tracking = new Map(l.pos.flatMap((p) => p.parcels).map((p) => [p.trackingNumber, p]));
  const rows = [...parcels.values()].sort((a, b) => (b.shipped?.getTime() ?? 0) - (a.shipped?.getTime() ?? 0));
  return (
    <Section
      title={`${n(rows.length)} UPS parcel(s)`}
      description={upsReady ? "Status from the UPS tracking API. Numbers are rechecked when refreshed, until delivered." : "UPS tracking isn't set up yet (UPS_CLIENT_ID and UPS_CLIENT_SECRET in .env); the numbers link to ups.com."}
      action={upsReady && canManage ? <UpsRefreshButton /> : undefined}
    >
      <Table
        rows={rows}
        empty="No UPS numbers in the WMS data."
        cols={[
          { header: "Tracking #", cell: (r) => <UpsLink number={r.number} /> },
          { header: "PO", cell: (r) => <span className="space-x-2">{r.pos.map((po) => <PoLink key={po} po={po} />)}</span> },
          { header: "Shipped (WMS)", cell: (r) => (r.shipped ? formatUtcDateTime(r.shipped) : "—") },
          {
            header: "UPS status",
            cell: (r) => {
              const t = tracking.get(r.number);
              if (!t) return <span className="text-gray-400">Not checked</span>;
              if (t.error && !t.status) return <span className="text-amber-700">{t.error}</span>;
              return <span className={t.delivered ? "text-green-700" : t.statusType === "X" ? "text-red-700" : "text-gray-900"}>{t.status}</span>;
            },
          },
          { header: "Last activity", cell: (r) => { const t = tracking.get(r.number); return t?.lastActivity ? `${t.lastActivity}${t.lastLocation ? ` · ${t.lastLocation}` : ""}` : "—"; } },
          { header: "Delivered / expected", cell: (r) => { const t = tracking.get(r.number); return t?.deliveredAt ? formatUtcDateTime(t.deliveredAt) : t?.expectedAt ? `Expected ${formatUtcDate(t.expectedAt)}` : "—"; } },
          { header: "Checked", cell: (r) => { const t = tracking.get(r.number); return t?.checkedAt ? formatDateTime(t.checkedAt, tz) : "—"; } },
        ]}
      />
    </Section>
  );
}

export function ImportHistory({ rows, tz }: { rows: { id: string; source: keyof typeof LOGISTICS_KIND_LABELS; fileName: string; rows: number; created: number; updated: number; fetched: boolean; importedAt: Date; importedBy: string | null; skipped: number }[]; tz: string }) {
  return (
    <Section title="Import history" description="The latest 50 imports.">
      <Table
        rows={rows}
        empty="Nothing imported yet."
        cols={[
          { header: "When", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.importedAt, tz)}</span> },
          { header: "File", cell: (r) => <span className="text-gray-900">{r.fileName}</span> },
          { header: "Source", cell: (r) => LOGISTICS_KIND_LABELS[r.source] },
          { header: "Rows", cell: (r) => n(r.rows), align: "right" },
          { header: "New", cell: (r) => n(r.created), align: "right" },
          { header: "Updated", cell: (r) => n(r.updated), align: "right" },
          { header: "Skipped", cell: (r) => (r.skipped ? <span className="text-amber-700">{n(r.skipped)}</span> : "—"), align: "right" },
          { header: "By", cell: (r) => (r.fetched && !r.importedBy ? "Scheduled pull" : `${r.importedBy ?? "—"}${r.fetched ? " (pulled)" : ""}`) },
        ]}
      />
    </Section>
  );
}



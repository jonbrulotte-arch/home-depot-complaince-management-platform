import Link from "next/link";
import { fiscalLabel } from "@/lib/fiscal";
import { CANCEL_SOURCE_LABELS, programLabel, cancelFilterOptions, cancelTotals, groupCancellations, type CancelGroup, type CancelRow } from "@/lib/cancellations";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { Section, Table, money, n, type Col } from "./ui";
import { CancellationFilters } from "./cancellation-filters";
import { MonthColumns } from "./cancellation-charts";

const PAGE = 250;

/** Totals columns shared by the breakdown tables */
const groupCols = (first: string): Col<CancelGroup>[] => [
  { header: first, cell: (g) => g.label },
  { header: "Cancellations", cell: (g) => n(g.rows), align: "right" },
  { header: "Units", cell: (g) => n(g.units), align: "right" },
  { header: "Order value", cell: (g) => money(g.value), align: "right" },
  { header: "THD offsets", cell: (g) => money(g.offsets), align: "right" },
  { header: "Recovered", cell: (g) => money(g.recovered), align: "right" },
  { header: "Net offsets", cell: (g) => money(g.net), align: "right" },
  { header: "Est. fines", cell: (g) => (g.estimatedFines ? money(g.estimatedFines) : "—"), align: "right" },
];

/** Reports & Insights › Cancellations: the financial impact of cancelled orders */
export function CancellationsTab({ rows, all, filters, poLookup, logistics, issues, showAllHref }: { rows: CancelRow[]; all: CancelRow[]; filters: Record<string, string | undefined>; poLookup: boolean; /** logistics.view: PO numbers open the Logistics PO record */ logistics: boolean; issues: boolean; /** The tab with no filters and all time */ showAllHref: string }) {
  const t = cancelTotals(rows);
  // Everything recorded, so a time frame or filter never quietly understates the impact
  const everything = cancelTotals(all);
  const hidden = { rows: everything.rows - t.rows, units: everything.units - t.units, value: Math.round((everything.value - t.value) * 100) / 100, offsets: Math.round((everything.offsets - t.offsets) * 100) / 100 };
  const opts = cancelFilterOptions(all);
  const top = (gs: CancelGroup[], k = 12) => gs.slice(0, k);
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Cancelled POs and SKU lines from POM (Supplier Hub), THD&apos;s Fill Rate charges for what wasn&apos;t shipped (with disputes and what was recovered) and the Issue Log&apos;s Order and Line cancellation issues, one row
        per PO and SKU. <strong className="font-medium text-gray-700">Order value</strong> is the cancelled units at POM&apos;s unit cost (sales lost); <strong className="font-medium text-gray-700">net offsets</strong> are THD&apos;s
        charges less what disputes recovered. The time frame and program above apply; a row counts in the PO&apos;s create month (POM), else the month THD charged it, else the issue&apos;s.
      </p>
      <CancellationFilters values={filters} teams={opts.teams} dcs={opts.dcs} vendors={opts.vendors} reasons={opts.reasons} />
      {hidden.rows > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            The time frame and filters hide <strong>{n(hidden.rows)}</strong> of {n(everything.rows)} cancellations: <strong>{money(hidden.value)}</strong> of {money(everything.value)} order value ({n(hidden.units)} units)
            {hidden.offsets > 0 ? ` and ${money(hidden.offsets)} of THD offsets` : ""}.
          </span>
          <Link href={showAllHref} className="font-medium text-blue-700 hover:underline">
            Show all cancellations
          </Link>
        </div>
      )}
      <StatTiles
        stats={[
          { label: "Cancellations", value: n(t.rows), hint: `${n(t.pos)} PO(s)` },
          { label: "Units cancelled", value: n(t.units), hint: "POM" },
          { label: "Order value", value: money(t.value), hint: "Cancelled units × unit cost" },
          { label: "THD offsets", value: money(t.offsets), tone: t.offsets ? "text-red-700" : undefined, hint: `${n(t.charged)} charged · ${n(t.disputed)} disputed` },
          { label: "Recovered", value: money(t.recovered), tone: t.recovered ? "text-green-700" : undefined, hint: `Net ${money(t.net)}` },
          { label: "Estimated fines", value: money(t.estimatedFines), hint: "Issue Log" },
        ]}
      />
      {(() => {
        const months = groupCancellations(rows, (r) => (r.month ? String(r.month) : null), (k) => fiscalLabel(Number(k)), "key").filter((g) => g.key !== "—");
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <MonthColumns title="Order value cancelled by month" data={months.map((g) => ({ label: g.label, value: g.value }))} />
            <MonthColumns title="THD offsets by month" data={months.map((g) => ({ label: g.label, value: g.offsets }))} />
          </div>
        );
      })()}
      <div className="grid gap-6">
        <Section title="By month">
          <Table rows={groupCancellations(rows, (r) => (r.month ? String(r.month) : null), (k) => (k === "—" ? "No date" : fiscalLabel(Number(k))), "key").reverse()} cols={groupCols("Month")} />
        </Section>
        <Section title="By program" description="THD's program for the charge, else the program the PO's POM vendor # is on (Admin › Programs & Rules), else the issue's. Choose a program above to filter by it.">
          <Table rows={groupCancellations(rows, programLabel)} cols={groupCols("Program")} />
        </Section>
        <Section title="By team responsible">
          <Table rows={groupCancellations(rows, (r) => r.team ?? "Not assigned")} cols={groupCols("Team")} />
        </Section>
        <Section title="By SKU" description="Largest impact first.">
          <Table rows={top(groupCancellations(rows, (r) => r.ourSku ?? r.thdSku, (k) => { const r = rows.find((x) => (x.ourSku ?? x.thdSku) === k); return r ? [r.ourSku, r.thdSku ? `THD ${r.thdSku}` : null, r.description].filter(Boolean).join(" · ") : k; }))} cols={groupCols("SKU")} />
        </Section>
        <Section title="By destination" description="Store/DC, largest impact first.">
          <Table rows={top(groupCancellations(rows, (r) => r.destination))} cols={groupCols("Store/DC")} />
        </Section>
        <Section title="By root cause" description="From the violation review.">
          <Table rows={top(groupCancellations(rows, (r) => r.rootCause ?? "Not recorded"))} cols={groupCols("Root cause")} />
        </Section>
        <Section title="By POM vendor # and PO reason code" description="THD's order streams: each vendor number and reason code (order type) apart.">
          <Table rows={groupCancellations(rows, (r) => (r.vendorNumber || r.reasonCode ? `Vendor ${r.vendorNumber ?? "?"} · reason ${r.reasonCode ?? "?"}` : "Not in POM"))} cols={groupCols("Vendor # · reason code")} />
        </Section>
        <Section title="By source and scope">
          <Table
            rows={[...groupCancellations(rows, (r) => r.sources.map((s) => CANCEL_SOURCE_LABELS[s])), ...groupCancellations(rows, (r) => (r.wholePo ? "Whole PO cancelled" : "SKU line cancelled"))]}
            cols={groupCols("Source / scope")}
          />
        </Section>
      </div>
      <Section title={`Cancellations (${n(rows.length)})`} description={rows.length > PAGE ? `The ${PAGE} with the largest impact are listed; the export has them all.` : "Newest first."}>
        <Table
          rows={rows.length > PAGE ? [...rows].sort((a, b) => b.net + b.value - (a.net + a.value)).slice(0, PAGE) : rows}
          empty="No cancellations match."
          cols={[
            { header: "Month", cell: (r) => (r.month ? fiscalLabel(r.month) : "—") },
            {
              header: "PO",
              cell: (r) =>
                logistics || poLookup ? (
                  <Link href={logistics ? `/logistics/po/${encodeURIComponent(r.poNumber)}` : `/po-lookup?q=${encodeURIComponent(r.poNumber)}`} className="text-blue-600 hover:underline">
                    {r.poNumber}
                  </Link>
                ) : (
                  r.poNumber
                ),
            },
            {
              header: "SKU",
              cell: (r) => (
                <span className="block text-xs">
                  <span className="text-gray-900">{[r.ourSku, r.thdSku ? `THD ${r.thdSku}` : null].filter(Boolean).join(" · ") || (r.wholePo ? "Whole PO" : "—")}</span>
                  {r.description && <span className="block text-gray-500">{r.description}</span>}
                </span>
              ),
            },
            { header: "Store/DC", cell: (r) => r.destination ?? "—" },
            { header: "Source", cell: (r) => <span className="text-xs">{r.sources.map((s) => CANCEL_SOURCE_LABELS[s]).join(", ")}</span> },
            { header: "Units", cell: (r) => (r.units ? n(r.units) : "—"), align: "right" },
            { header: "Order value", cell: (r) => (r.value ? money(r.value) : "—"), align: "right" },
            { header: "THD offset", cell: (r) => (r.offsets ? money(r.offsets) : "—"), align: "right" },
            { header: "Recovered", cell: (r) => (r.recovered ? money(r.recovered) : "—"), align: "right" },
            { header: "Dispute", cell: (r) => <span className="text-xs">{r.disputeStatus ? DISPUTE_STATUS_LABELS[r.disputeStatus] : r.offsets ? "Not disputed" : "—"}</span> },
            {
              header: "Team / cause / issue",
              cell: (r) => (
                <span className="block max-w-xs text-xs text-gray-600">
                  {r.team && <span className="block font-medium text-gray-800">{r.team}</span>}
                  {r.rootCause && <span className="block">{r.rootCause}</span>}
                  {r.issues.map((i) => {
                    const text = `ISS-${String(i.number).padStart(4, "0")} ${i.category} (${i.status.toLowerCase().replace("_", " ")})`;
                    return issues ? (
                      <Link key={i.id} href={`/issues/${i.id}`} className="block text-blue-600 hover:underline">
                        {text}
                      </Link>
                    ) : (
                      <span key={i.id} className="block">
                        {text}
                      </span>
                    );
                  })}
                </span>
              ),
            },
          ]}
        />
      </Section>
    </div>
  );
}

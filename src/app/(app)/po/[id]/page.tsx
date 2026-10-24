import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { getPoRecord, type PoRecordView } from "@/lib/po-record";
import { fiscalLabel } from "@/lib/fiscal";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { LINE_FIELD_LABELS, TEAM_INFLUENCES } from "@/lib/line-fields";
import { periodLabel } from "@/lib/shipment-ranges";
import { cn, formatCurrency, formatDateTime, formatUtcDate, formatUtcDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceBadge, DispositionBadge, DisputeStatusBadge } from "@/components/shared/status-badges";

type Line = PoRecordView["record"]["lines"][number];

const fieldValue = (kind: string, v: unknown) =>
  v instanceof Date ? (kind === "date" ? formatUtcDateTime(v) : v.toISOString()) : typeof v === "object" && v !== null ? String(Number(v)) : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);

const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))];

export default async function PoRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("view.polookup");
  const found = await getPoRecord((await params).id);
  if (!found) notFound();
  const { record, otherUses, reasonCode, reportsFor } = found;
  const { lines } = record;
  const canSeeReports = user.permissions.has("reports.view");

  const violations = lines.filter((l) => !l.isCompliant);
  const resolved = violations.filter((l) => l.review?.disposition === "RESOLVED");
  const preOffset = violations.reduce((s, l) => s + Number(l.offsetAmount), 0);
  const recovered = violations.reduce((s, l) => s + (l.dispute && ["APPROVED", "PARTIAL"].includes(l.dispute.status) ? Number(l.dispute.amountRecovered ?? 0) : 0), 0);
  const disputes = violations.filter((l) => l.dispute && l.dispute.status !== "WITHDRAWN");
  const months = [...new Set(lines.map((l) => l.fiscalMonth))].sort((a, b) => a - b);

  const details: [string, string][] = [
    ["PO #", record.poNumber],
    ["PO create date", record.poCreateDate ? formatUtcDate(record.poCreateDate) : "Not in the exports"],
    ["M-Vendor", [record.mVendor, record.mVendorName?.trim()].filter(Boolean).join(" · ") || "—"],
    ["P-Vendor", record.pVendor ?? "—"],
    ["Department", record.dept ?? "—"],
    ["DC / locations", distinct([record.dcNumber, ...lines.map((l) => l.dcNumber)]).join(", ") || "—"],
    ["Programs", distinct(lines.map((l) => l.metric.program.name)).join(", ")],
    ["Fiscal months", months.length ? `${fiscalLabel(months[0])}${months.length > 1 ? ` – ${fiscalLabel(months[months.length - 1])}` : ""} (FM ${months.join(", ")})` : "—"],
    ["First imported", formatDateTime(record.firstSeenAt)],
    ["Last imported", formatDateTime(record.lastSeenAt)],
  ];

  const refs: [string, string[]][] = [
    ["Customer order #", distinct(lines.map((l) => l.customerOrder))],
    ["OMS ID", distinct(lines.map((l) => l.omsId))],
    ["Tracking #", distinct(lines.map((l) => l.trackingNumber))],
    ["BOL #", distinct(lines.map((l) => l.bolNumber))],
    ["Carrier PRO #", distinct(lines.map((l) => l.carrierPro))],
    ["TMS ID / freight bill", distinct(lines.map((l) => l.tmsId))],
    ["ASN doc trace ID", distinct(lines.map((l) => l.docTraceId))],
    ["Shipment #", distinct(lines.map((l) => l.shipmentNumber))],
    ["Carrier", distinct(lines.map((l) => l.carrierUsed))],
    ["Invoice #", distinct(lines.map((l) => l.invoiceNumber))],
  ].filter(([, v]) => v.length > 0) as [string, string[]][];

  const items = new Map<string, { sku: string | null; vendorSku: string | null; description: string | null; ordered: number | null; received: number | null; metrics: Set<string> }>();
  for (const l of lines) {
    if (!l.sku && !l.vendorSku) continue;
    const key = `${l.sku ?? ""}|${l.vendorSku ?? ""}`;
    const item = items.get(key) ?? { sku: l.sku, vendorSku: l.vendorSku, description: l.skuDescription, ordered: null, received: null, metrics: new Set<string>() };
    if (l.orderedQty != null) item.ordered = Math.max(item.ordered ?? 0, Number(l.orderedQty));
    if (l.receivedQty != null) item.received = Math.max(item.received ?? 0, Number(l.receivedQty));
    item.metrics.add(`${l.metric.program.name} · ${l.metric.name}`);
    items.set(key, item);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Link href={`/po-lookup?q=${encodeURIComponent(record.poNumber)}`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> PO Lookup
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">PO {record.poNumber}</h1>
          {otherUses.length > 0 && <Badge variant="warning">PO number used {otherUses.length + 1} times</Badge>}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          PO record{record.poCreateDate ? ` created ${formatUtcDate(record.poCreateDate)}` : ""} · {lines.length} compliance line(s) across {months.length} fiscal month(s)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Compliance lines" value={String(lines.length)} sub={`${lines.length - violations.length} compliant`} />
        <Stat label="Violations" value={String(violations.length - resolved.length)} sub={resolved.length ? `${resolved.length} cancelled / resolved` : undefined} tone={violations.length - resolved.length ? "red" : undefined} />
        <Stat label="Offsets (pre-dispute)" value={formatCurrency(preOffset)} />
        <Stat label="Disputes" value={String(disputes.length)} sub={disputes.length ? `${formatCurrency(recovered)} recovered` : undefined} />
        <Stat label="Net offsets" value={formatCurrency(Math.max(0, preOffset - recovered))} tone={preOffset - recovered > 0 ? "red" : undefined} />
      </div>

      {otherUses.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          THD reused this PO number. Other uses:{" "}
          {otherUses.map((u, i) => (
            <span key={u.id}>
              {i > 0 && ", "}
              <Link href={`/po/${u.id}`} className="font-medium underline">
                {u.poCreateDate ? `created ${formatUtcDate(u.poCreateDate)}` : "create date unknown"}
              </Link>{" "}
              ({u._count.lines} line{u._count.lines === 1 ? "" : "s"})
            </span>
          ))}
          .
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>PO details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-sm text-gray-900 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Shipment references</CardTitle>
          </CardHeader>
          <CardContent>
            {refs.length ? (
              <dl className="space-y-3">
                {refs.map(([label, values]) => (
                  <div key={label}>
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="text-sm text-gray-900 break-all">{values.join(", ")}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">No shipment references in the exports.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {items.size > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto border-t border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["THD SKU", "Vendor SKU", "Description", "Ordered", "Received", "Measured in"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...items.values()].map((it) => (
                  <tr key={`${it.sku}|${it.vendorSku}`} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-gray-900">{it.sku ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{it.vendorSku ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{it.description ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{it.ordered ?? "—"}</td>
                    <td className={cn("px-4 py-3", it.ordered != null && it.received != null && it.received < it.ordered ? "font-medium text-red-700" : "text-gray-700")}>{it.received ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{[...it.metrics].join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Compliance lines</h2>
        {lines.map((l) => (
          <LineDetail key={l.id} line={l} reasonCode={l.review?.reasonCodeId ? (reasonCode.get(l.review.reasonCodeId) ?? null) : null} reports={reportsFor(l)} canSeeReports={canSeeReports} />
        ))}
      </div>

      <Activity lines={lines} />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone === "red" ? "text-red-700" : "text-gray-900")}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </Card>
  );
}

function LineDetail({ line: l, reasonCode, reports, canSeeReports }: { line: Line; reasonCode: string | null; reports: { id: string; title: string; historical: boolean }[]; canSeeReports: boolean }) {
  const record = l as unknown as Record<string, unknown>;
  const fields = LINE_FIELD_LABELS.filter(([key]) => key !== "poNumber" && record[key] != null && record[key] !== "");
  const raw = Object.entries((l.raw ?? {}) as Record<string, unknown>);
  const extras = Object.entries((l.review?.extraFields ?? {}) as Record<string, string>);
  const offset = Number(l.offsetAmount);
  return (
    <details className="group rounded-lg border border-gray-200 bg-white" open={!l.isCompliant}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
        <span className="w-24 text-sm text-gray-700">
          {fiscalLabel(l.fiscalMonth)}
          <span className="block text-xs text-gray-400">FM {l.fiscalMonth}</span>
        </span>
        <span className="min-w-0 flex-1 text-sm text-gray-900">
          {l.metric.program.name} · {l.metric.name}
          <span className="block text-xs text-gray-500">{[l.sku && `SKU ${l.sku}`, l.dcNumber && `DC ${l.dcNumber}`, l.lateReason ?? l.reason].filter(Boolean).join(" · ")}</span>
        </span>
        <ComplianceBadge compliant={l.isCompliant} />
        {!l.isCompliant && <DispositionBadge disposition={l.review?.disposition} />}
        {l.dispute && l.dispute.status !== "WITHDRAWN" && <DisputeStatusBadge status={l.dispute.status} />}
        <span className="w-24 text-right text-sm font-medium text-gray-900">{offset ? formatCurrency(offset) : "—"}</span>
      </summary>
      <div className="space-y-4 border-t border-gray-200 p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map(([key, label, kind]) => (
            <div key={key}>
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="text-sm text-gray-900 break-words">{fieldValue(kind, record[key])}</dd>
            </div>
          ))}
        </dl>

        <Section title="Source">
          <p>
            {l.batch.fileName} · sheet &quot;{l.sourceSheet}&quot;, row {l.sourceRow}
          </p>
          <p className="text-gray-500">
            {l.batch.source === "backfill" ? "Loaded from the archive" : `Imported ${formatDateTime(l.batch.importedAt)}${l.batch.importedBy ? ` by ${l.batch.importedBy.name}` : ""}`}
            {l.batch.exportKind !== "UNKNOWN" && ` · ${l.batch.exportKind.replace("_", " ").toLowerCase()} export`}
            {l.batch.source !== "backfill" && ` · ${periodLabel(l.batch.period)} import`}
            {` · received ${fiscalLabel(l.receivedMonth)}`}
          </p>
          {reports.length > 0 && (
            <p className="text-gray-500">
              In{" "}
              {reports.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  {canSeeReports ? (
                    <Link href={`/reports/${r.id}`} className="text-blue-600 hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                </span>
              ))}
            </p>
          )}
        </Section>

        {l.review && (
          <Section title="Violation review">
            <div className="flex flex-wrap items-center gap-2">
              <DispositionBadge disposition={l.review.disposition} />
              {l.review.teamInfluence && <span>Team: {TEAM_INFLUENCES[l.review.teamInfluence]}</span>}
              {reasonCode && <span>· Reason code: {reasonCode}</span>}
            </div>
            {l.review.rootCause && <p className="font-medium text-gray-800">Root cause: {l.review.rootCause}</p>}
            {l.review.notes && <p className="whitespace-pre-wrap">{l.review.notes}</p>}
            {extras.length > 0 && (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {extras.map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-gray-500">{k}:</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-xs text-gray-400">
              {l.review.reviewedAt ? `Reviewed ${formatDateTime(l.review.reviewedAt)}` : `Updated ${formatDateTime(l.review.updatedAt)}`}
              {l.review.reviewer ? ` by ${l.review.reviewer.name}` : ""}
            </p>
          </Section>
        )}

        {l.dispute && (
          <Section title="Dispute">
            <div className="flex flex-wrap items-center gap-2">
              <DisputeStatusBadge status={l.dispute.status} />
              {l.dispute.reasonCode && <span>Reason code: {l.dispute.reasonCode.code}</span>}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {(
                [
                  ["Disputed", formatCurrency(Number(l.dispute.amountDisputed))],
                  ["Recovered", l.dispute.amountRecovered == null ? "—" : formatCurrency(Number(l.dispute.amountRecovered))],
                  ["Submitted", l.dispute.submittedAt ? formatDateTime(l.dispute.submittedAt) : "—"],
                  ["SPM reference", l.dispute.spmReference ?? "—"],
                  ["Decided", l.dispute.decidedAt ? formatDateTime(l.dispute.decidedAt) : "—"],
                  ["THD decision code", l.dispute.decisionCode ?? "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {l.dispute.decisionNotes && <p className="whitespace-pre-wrap">THD decision: {l.dispute.decisionNotes}</p>}
            {l.dispute.supplierComment && <p className="whitespace-pre-wrap text-gray-500">Comment submitted to SPM: {l.dispute.supplierComment}</p>}
            {l.dispute.attachments.length > 0 && (
              <ul className="space-y-1">
                {l.dispute.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-gray-400" />
                    {canSeeReports ? (
                      <a href={`/api/disputes/${l.dispute!.id}/attachments/${a.id}`} className="text-blue-600 hover:underline">
                        {a.fileName}
                      </a>
                    ) : (
                      a.fileName
                    )}
                    <span className="text-xs text-gray-400">{Math.ceil(a.size / 1024)} KB · {formatDateTime(a.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {l.dispute.events.length > 0 && (
              <ol className="space-y-1 border-l border-gray-200 pl-3">
                {l.dispute.events.map((e) => (
                  <li key={e.id} className="text-xs text-gray-600">
                    <span className="text-gray-400">{formatDateTime(e.at)}</span>
                    {e.user ? ` · ${e.user.name}` : ""}
                    {e.toStatus ? ` · ${e.fromStatus ? `${DISPUTE_STATUS_LABELS[e.fromStatus]} → ` : ""}${DISPUTE_STATUS_LABELS[e.toStatus]}` : ""}
                    {e.body ? ` · ${e.body}` : ""}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        {l.feedback.length > 0 && (
          <Section title="Scorecard feedback">
            {l.feedback.map((f) => (
              <div key={f.id}>
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{f.author?.name ?? "Former user"}</span> · {formatDateTime(f.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{f.body}</p>
              </div>
            ))}
          </Section>
        )}

        {raw.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">All columns from the export ({raw.length})</summary>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {raw.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-gray-500">{k}</dt>
                  <dd className="text-sm text-gray-900 break-words">{v === null || v === "" ? "—" : String(v)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      {children}
    </div>
  );
}

/** Everything that happened to this PO's lines, newest first */
function Activity({ lines }: { lines: Line[] }) {
  const events: { at: Date; text: string }[] = [];
  const label = (l: Line) => `${l.metric.program.name} · ${l.metric.name} (${fiscalLabel(l.fiscalMonth)})`;
  const imports = new Map<string, { at: Date; text: string }>();
  for (const l of lines) {
    const key = `${l.batch.fileName}|${l.batch.importedAt.toISOString()}`;
    if (!imports.has(key)) imports.set(key, { at: l.batch.importedAt, text: `Imported from ${l.batch.fileName}${l.batch.importedBy ? ` by ${l.batch.importedBy.name}` : ""}` });
    if (l.review?.reviewedAt) events.push({ at: l.review.reviewedAt, text: `${label(l)} reviewed as ${l.review.disposition.replace("_", " ").toLowerCase()}${l.review.reviewer ? ` by ${l.review.reviewer.name}` : ""}` });
    for (const e of l.dispute?.events ?? []) {
      events.push({ at: e.at, text: `${label(l)} dispute: ${e.toStatus ? DISPUTE_STATUS_LABELS[e.toStatus] : e.type.toLowerCase().replace("_", " ")}${e.user ? ` (${e.user.name})` : ""}` });
    }
    for (const f of l.feedback) events.push({ at: f.createdAt, text: `${label(l)} feedback from ${f.author?.name ?? "a former user"}` });
  }
  events.push(...imports.values());
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  if (!events.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 border-l border-gray-200 pl-4">
          {events.map((e, i) => (
            <li key={i} className="text-sm text-gray-700">
              <span className="text-xs text-gray-400">{formatDateTime(e.at)}</span> · {e.text}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

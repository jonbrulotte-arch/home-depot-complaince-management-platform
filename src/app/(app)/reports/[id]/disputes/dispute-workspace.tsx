"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check, ChevronDown, ChevronRight, Copy, Download, Paperclip, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Disposition, DisputeEventType, DisputeStatus, ReportStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DispositionBadge, DisputeStatusBadge } from "@/components/shared/status-badges";
import { apiFetch } from "@/lib/client-api";
import { allowedTransitions, DISPUTE_STATUS_LABELS, MAX_ATTACHMENT_BYTES, type ChecklistItem } from "@/lib/disputes";
import { cn, formatCurrency, formatDateTime, formatUtcDate, formatUtcDateTime } from "@/lib/utils";

export interface DisputeView {
  id: string;
  status: DisputeStatus;
  programName: string;
  metricId: string;
  metricName: string;
  poNumber: string | null;
  lineOffset: number;
  /** What was recorded for the line in the violation review */
  review: { disposition: Disposition; teamInfluence: string | null; rootCause: string | null; notes: string | null; extraFields: [string, string][] } | null;
  keyFields: { key: string; label: string; kind: "text" | "date" | "number" | "bool"; value: string | number | boolean }[];
  reasonCodeId: string | null;
  amountDisputed: number;
  amountRecovered: number | null;
  dueDate: string | null;
  checklist: ChecklistItem[];
  supplierComment: string | null;
  submittedAt: string | null;
  spmReference: string | null;
  decidedAt: string | null;
  decisionCode: string | null;
  decisionNotes: string | null;
  spmDecisionSeen: string | null;
  events: { id: string; type: DisputeEventType; body: string | null; fromStatus: DisputeStatus | null; toStatus: DisputeStatus | null; user: string | null; at: string }[];
  attachments: { id: string; fileName: string; size: number; uploadedAt: string; uploadedBy: string | null }[];
}

interface ReasonCode {
  id: string;
  metricId: string;
  code: string;
  whenToUse: string | null;
  requiredDocs: string | null;
  docDetails: string | null;
}

interface Period {
  id: string;
  fiscalMonth: number;
  disputeOpen: string | null;
  disputeClose: string | null;
}

const NONE = "__none__";
const GROUP_ORDER: { label: string; statuses: DisputeStatus[] }[] = [
  { label: "To prepare", statuses: ["PREPARING"] },
  { label: "Ready to submit", statuses: ["READY"] },
  { label: "Awaiting THD decision", statuses: ["SUBMITTED"] },
  { label: "Decided", statuses: ["APPROVED", "PARTIAL", "DENIED"] },
  { label: "Withdrawn", statuses: ["WITHDRAWN"] },
];

const today = () => new Date().toISOString().slice(0, 10);
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const close = new Date(iso);
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((close.getTime() - start) / 86_400_000);
}

function DueLabel({ iso }: { iso: string | null }) {
  const days = daysUntil(iso);
  if (days === null) return <span className="text-gray-400">No due date</span>;
  const text = days < 0 ? `${-days} day(s) overdue` : days === 0 ? "Due today" : `${days} day(s) left`;
  return <span className={cn(days < 0 ? "text-red-700" : days <= 5 ? "text-amber-700" : "text-gray-500")}>{formatUtcDate(iso)} · {text}</span>;
}

export function DisputeWorkspace({
  reportId,
  reportStatus,
  period,
  disputes,
  reasonCodes,
  initialId,
  canEdit,
}: {
  reportId: string;
  reportStatus: ReportStatus;
  period: Period;
  disputes: DisputeView[];
  reasonCodes: ReasonCode[];
  initialId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [chosenId, setSelectedId] = useState(initialId);
  // Fall back to the first dispute, including ones that appear after a sync
  const selectedId = disputes.some((d) => d.id === chosenId) ? chosenId : (disputes[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const selected = disputes.find((d) => d.id === selectedId) ?? null;

  const active = disputes.filter((d) => d.status !== "WITHDRAWN");
  const disputed = active.reduce((s, d) => s + d.amountDisputed, 0);
  const recovered = active.reduce((s, d) => s + (d.amountRecovered ?? 0), 0);
  const awaiting = active.filter((d) => d.status === "PREPARING" || d.status === "READY").length;

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const r = await apiFetch<{ created: number; reopened: number; withdrawn: number }>(`/api/reports/${reportId}/disputes/sync`, { method: "POST" });
      setMessage(`${r.created} created, ${r.reopened} reopened, ${r.withdrawn} withdrawn.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-200 bg-white px-6 py-3 text-sm">
        <DisputeWindow period={period} canEdit={canEdit} />
        <span className="text-gray-500">{active.length} dispute(s) · {formatCurrency(disputed)} disputed · <span className="text-green-700">{formatCurrency(recovered)} recovered</span></span>
        {awaiting > 0 && <Badge variant="warning">{awaiting} not yet submitted</Badge>}
        {canEdit && (reportStatus === "DISPUTES" || reportStatus === "SCORECARD") && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={sync} disabled={syncing} title="Create disputes for lines marked Disputable since this stage started">
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {syncing ? "Syncing…" : "Sync from review"}
          </Button>
        )}
      </div>
      {(error || message) && (
        <div className={cn("mx-6 mt-3 rounded-lg px-4 py-3 text-sm", error ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-800")}>{error ?? message}</div>
      )}

      {disputes.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">
          No disputes yet. Mark lines as <span className="font-medium">Disputable</span> in the violation review, then move the report to Disputes.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-80 shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
            {GROUP_ORDER.map((g) => {
              const items = disputes.filter((d) => g.statuses.includes(d.status));
              if (!items.length) return null;
              return (
                <div key={g.label}>
                  <p className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.label} ({items.length})</p>
                  {items.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={cn("flex w-full items-start justify-between gap-2 border-t border-gray-100 px-4 py-3 text-left hover:bg-gray-50", d.id === selectedId && "bg-blue-50")}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">PO {d.poNumber ?? "—"}</p>
                        <p className="truncate text-xs text-gray-500">{d.metricName} · {formatCurrency(d.amountDisputed)}</p>
                        {d.spmDecisionSeen && <p className="text-xs text-amber-700">SPM shows: {d.spmDecisionSeen}</p>}
                      </div>
                      <DisputeStatusBadge status={d.status} />
                    </button>
                  ))}
                </div>
              );
            })}
          </aside>
          <section className="min-w-0 flex-1 overflow-y-auto p-6">
            {selected ? (
              <DisputeDetail key={selected.id} dispute={selected} reasonCodes={reasonCodes.filter((r) => r.metricId === selected.metricId)} canEdit={canEdit} />
            ) : (
              <p className="text-sm text-gray-400">Select a dispute.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function DisputeWindow({ period, canEdit }: { period: Period; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(dateInput(period.disputeOpen));
  const [close, setClose] = useState(dateInput(period.disputeClose));
  const [moveDue, setMoveDue] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await apiFetch(`/api/periods/${period.id}`, { method: "PATCH", body: { disputeOpen: open, disputeClose: close, updateDueDates: moveDue } });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500">SPM dispute window</span>
        <Input type="date" value={open} onChange={(e) => setOpen(e.target.value)} className="w-40" />
        <span className="text-gray-400">to</span>
        <Input type="date" value={close} onChange={(e) => setClose(e.target.value)} className="w-40" />
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={moveDue} onChange={(e) => setMoveDue(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          Update due dates of unsubmitted disputes
        </label>
        <Button size="sm" onClick={save} disabled={!open || !close}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <CalendarClock className="h-4 w-4 text-gray-400" />
      <span className="text-gray-500">SPM dispute window</span>
      <span className="text-gray-900">{period.disputeOpen ? `${formatUtcDate(period.disputeOpen)} – ` : ""}</span>
      <DueLabel iso={period.disputeClose} />
      {canEdit && (
        <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">Edit</button>
      )}
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-green-100 text-green-800" : "bg-blue-50 text-blue-700")}>
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </div>
  );
}

function DisputeDetail({ dispute, reasonCodes, canEdit }: { dispute: DisputeView; reasonCodes: ReasonCode[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState(dispute.supplierComment ?? "");
  const [newItem, setNewItem] = useState("");
  // Updated optimistically so ticks show at once; the server copy arrives on refresh
  const [items, setItems] = useState(dispute.checklist);
  const [submittedOn, setSubmittedOn] = useState(today());
  const [spmRef, setSpmRef] = useState(dispute.spmReference ?? "");
  const [decision, setDecision] = useState({ code: dispute.decisionCode ?? "", notes: dispute.decisionNotes ?? "", recovered: String(dispute.amountRecovered ?? dispute.amountDisputed), date: today() });
  const [note, setNote] = useState("");
  const [showLine, setShowLine] = useState(false);
  const [copied, setCopied] = useState(false);
  const reason = reasonCodes.find((r) => r.id === dispute.reasonCodeId);
  const editable = canEdit && dispute.status !== "WITHDRAWN";
  const prepEditable = editable && (dispute.status === "PREPARING" || dispute.status === "READY");
  const allowed = allowedTransitions(dispute.status);
  const docsDone = items.length > 0 && items.every((c) => c.done);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/disputes/${dispute.id}`, { method: "PATCH", body });
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("Attachments are limited to 10 MB");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      await apiFetch(`/api/disputes/${dispute.id}/attachments`, { form });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeAttachment(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/disputes/${dispute.id}/attachments/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the file");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    setBusy(true);
    try {
      await apiFetch(`/api/disputes/${dispute.id}/events`, { body: { body: note } });
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the note");
    } finally {
      setBusy(false);
    }
  }

  async function copyComment() {
    await navigator.clipboard.writeText(comment);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function checklist(next: ChecklistItem[]) {
    const previous = items;
    setItems(next);
    const ok = await patch({ checklist: next });
    if (!ok) setItems(previous);
    return ok;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500">{dispute.programName} · {dispute.metricName}</p>
          <h2 className="text-lg font-semibold text-gray-900">PO {dispute.poNumber ?? "—"}</h2>
          <p className="text-xs"><DueLabel iso={dispute.dueDate} /></p>
        </div>
        <div className="text-right space-y-1">
          <DisputeStatusBadge status={dispute.status} />
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(dispute.amountDisputed)}</p>
          {dispute.amountRecovered != null && <p className="text-sm text-green-700">{formatCurrency(dispute.amountRecovered)} recovered</p>}
        </div>
      </div>

      {dispute.spmDecisionSeen && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          A later SPM export shows THD&apos;s decision as &quot;{dispute.spmDecisionSeen}&quot;. Record the outcome below to close this dispute.
        </div>
      )}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white">
        <button onClick={() => setShowLine(!showLine)} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900">
          {showLine ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          Violation details
        </button>
        {showLine && (
          <div className="border-t border-gray-200 p-4 space-y-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {dispute.keyFields.map((f) => (
                <div key={f.key}>
                  <dt className="text-xs text-gray-500">{f.label}</dt>
                  <dd className="text-sm text-gray-900 break-words">{f.kind === "date" ? formatUtcDateTime(String(f.value)) : String(f.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {dispute.review && <ReviewSummary review={dispute.review} open={dispute.status === "PREPARING" || dispute.status === "READY"} />}

      <Step n={1} title="Reason code and supporting documents" done={docsDone && Boolean(reason)}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Dispute reason code</label>
          <Select value={dispute.reasonCodeId ?? NONE} onValueChange={(v) => patch({ reasonCodeId: v === NONE ? null : v })} disabled={!prepEditable || busy}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not chosen</SelectItem>
              {reasonCodes.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {reason && (
            <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-1">
              {reason.whenToUse && <p><span className="font-semibold">When to use:</span> {reason.whenToUse}</p>}
              {reason.requiredDocs && <p><span className="font-semibold">Required documents:</span> {reason.requiredDocs}</p>}
              <p>THD only reviews the listed documents; keep them concise and highlight the key information.</p>
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-1.5">Checklist</p>
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  checked={item.done}
                  disabled={!prepEditable}
                  onChange={() => checklist(items.map((c, j) => (j === i ? { ...c, done: !c.done } : c)))}
                />
                <span className={cn(item.done ? "text-gray-400 line-through" : "text-gray-700")}>{item.label}</span>
                {prepEditable && (
                  <button onClick={() => checklist(items.filter((_, j) => j !== i))} className="ml-auto p-1 rounded-md text-gray-300 hover:bg-gray-100 hover:text-red-600" title="Remove item">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {prepEditable && (
            <div className="mt-2 flex gap-2">
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a checklist item" />
              <Button
                variant="outline"
                size="sm"
                disabled={!newItem.trim() || busy}
                onClick={async () => {
                  if (await checklist([...items, { label: newItem.trim(), done: false }])) setNewItem("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-1.5">Attachments</p>
          {dispute.attachments.length === 0 && <p className="text-xs text-gray-400">No documents attached yet.</p>}
          <ul className="space-y-1">
            {dispute.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Paperclip className="h-4 w-4 text-gray-400" />
                <a href={`/api/disputes/${dispute.id}/attachments/${a.id}`} className="text-blue-600 hover:underline">{a.fileName}</a>
                <span className="text-xs text-gray-400">{(a.size / 1024).toFixed(0)} KB · {formatDateTime(a.uploadedAt)}{a.uploadedBy ? ` · ${a.uploadedBy}` : ""}</span>
                <a href={`/api/disputes/${dispute.id}/attachments/${a.id}`} className="ml-auto p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Download">
                  <Download className="h-3.5 w-3.5" />
                </a>
                {editable && (
                  <button onClick={() => removeAttachment(a.id)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Plus className="h-4 w-4" />
              Attach document
              <input type="file" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          )}
        </div>

        {dispute.status === "PREPARING" && canEdit && (
          <div className="flex justify-end">
            <Button onClick={() => patch({ status: "READY" })} disabled={busy} variant={docsDone ? "default" : "outline"}>
              Documents ready
            </Button>
          </div>
        )}
      </Step>

      <Step n={2} title="Submit in SPM" done={Boolean(dispute.submittedAt)}>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-600">
          <li>Supplier Hub › Supplier Performance Management › {dispute.programName} › {dispute.metricName}.</li>
          <li>Find PO {dispute.poNumber ?? "—"} and choose dispute reason code &quot;{reason?.code ?? "…"}&quot;.</li>
          <li>Attach the documents above and paste the comment below.</li>
        </ol>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Supplier comment</label>
            <button onClick={copyComment} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} disabled={!prepEditable} />
          {prepEditable && comment !== (dispute.supplierComment ?? "") && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => patch({ supplierComment: comment })} disabled={busy}>Save comment</Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Due date</label>
            <Input type="date" defaultValue={dateInput(dispute.dueDate)} disabled={!prepEditable || busy} onBlur={(e) => e.target.value !== dateInput(dispute.dueDate) && patch({ dueDate: e.target.value || null })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Submitted on</label>
            <Input type="date" value={dispute.submittedAt ? dateInput(dispute.submittedAt) : submittedOn} onChange={(e) => setSubmittedOn(e.target.value)} disabled={!prepEditable} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">SPM reference <span className="font-normal text-gray-400">(optional)</span></label>
            <Input value={spmRef} onChange={(e) => setSpmRef(e.target.value)} onBlur={() => spmRef !== (dispute.spmReference ?? "") && patch({ spmReference: spmRef })} disabled={!editable || busy} />
          </div>
        </div>
        {allowed.includes("SUBMITTED") && canEdit && dispute.status !== "WITHDRAWN" && !["APPROVED", "PARTIAL", "DENIED"].includes(dispute.status) && (
          <div className="flex justify-end">
            <Button onClick={() => patch({ status: "SUBMITTED", statusDate: submittedOn, supplierComment: comment, spmReference: spmRef || null })} disabled={busy}>
              Mark submitted in SPM
            </Button>
          </div>
        )}
      </Step>

      {(dispute.status === "SUBMITTED" || dispute.decidedAt) && (
        <Step n={3} title="THD decision" done={Boolean(dispute.decidedAt)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Decision / review code</label>
              <Input value={decision.code} onChange={(e) => setDecision({ ...decision, code: e.target.value })} placeholder="e.g. A1, D2" disabled={!canEdit} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount recovered</label>
              <Input type="number" min={0} step="0.01" value={decision.recovered} onChange={(e) => setDecision({ ...decision, recovered: e.target.value })} disabled={!canEdit} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Decision date</label>
              <Input type="date" value={decision.date} onChange={(e) => setDecision({ ...decision, date: e.target.value })} disabled={!canEdit || Boolean(dispute.decidedAt)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">THD comment</label>
            <Textarea rows={2} value={decision.notes} onChange={(e) => setDecision({ ...decision, notes: e.target.value })} disabled={!canEdit} />
          </div>
          {canEdit && dispute.status === "SUBMITTED" && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="destructive" disabled={busy} onClick={() => patch({ status: "DENIED", statusDate: decision.date, decisionCode: decision.code || null, decisionNotes: decision.notes || null })}>Denied</Button>
              <Button variant="outline" disabled={busy} onClick={() => patch({ status: "PARTIAL", statusDate: decision.date, amountRecovered: Number(decision.recovered), decisionCode: decision.code || null, decisionNotes: decision.notes || null })}>Partially approved</Button>
              <Button disabled={busy} onClick={() => patch({ status: "APPROVED", statusDate: decision.date, amountRecovered: Number(decision.recovered), decisionCode: decision.code || null, decisionNotes: decision.notes || null })}>Approved</Button>
            </div>
          )}
          {canEdit && dispute.decidedAt && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => patch({ decisionCode: decision.code || null, decisionNotes: decision.notes || null, ...(dispute.status !== "DENIED" ? { amountRecovered: Number(decision.recovered) } : {}) })}>Save changes</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => patch({ status: "SUBMITTED", note: "Decision reopened for correction" })}>Reopen decision</Button>
            </div>
          )}
        </Step>
      )}

      {canEdit && (allowed.includes("WITHDRAWN") || dispute.status === "WITHDRAWN" || dispute.status === "READY") && (
        <div className="flex justify-end gap-2">
          {dispute.status === "READY" && <Button variant="ghost" size="sm" onClick={() => patch({ status: "PREPARING" })} disabled={busy}>Back to preparing</Button>}
          {allowed.includes("WITHDRAWN") && <Button variant="ghost" size="sm" onClick={() => patch({ status: "WITHDRAWN", note: "Withdrawn" })} disabled={busy}>Withdraw dispute</Button>}
          {dispute.status === "WITHDRAWN" && <Button variant="outline" size="sm" onClick={() => patch({ status: "PREPARING" })} disabled={busy}>Reopen dispute</Button>}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Progress notes</p>
        {canEdit && (
          <div className="space-y-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Requested POD from carrier; THD coordinator asked for the 856…" />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={addNote} disabled={busy || !note.trim()}>Add note</Button>
            </div>
          </div>
        )}
        <ol className="space-y-3">
          {dispute.events.map((e) => (
            <li key={e.id} className="border-l-2 border-gray-200 pl-3">
              <p className="text-xs text-gray-500">
                {formatDateTime(e.at)}{e.user ? ` · ${e.user}` : ""}
                {e.type === "STATUS" && e.toStatus && <> · {e.fromStatus ? `${DISPUTE_STATUS_LABELS[e.fromStatus]} → ` : ""}{DISPUTE_STATUS_LABELS[e.toStatus]}</>}
                {e.type === "SPM_UPDATE" && " · SPM import"}
              </p>
              {e.body && <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.body}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Root cause, notes and research inputs recorded for the line in the violation review */
function ReviewSummary({ review, open }: { review: NonNullable<DisputeView["review"]>; open: boolean }) {
  const fields: [string, string | null][] = [
    ["Team influence", review.teamInfluence],
    ["Root cause", review.rootCause],
    ...review.extraFields,
  ];
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-gray-900">From the violation review</span>
        <DispositionBadge disposition={review.disposition} />
      </div>
      <div className="border-t border-gray-200 p-4 space-y-3">
        {review.disposition !== "DISPUTABLE" && open && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This line is no longer marked Disputable. Use Sync from review to withdraw the dispute.
          </div>
        )}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className={cn("text-sm break-words", value ? "text-gray-900" : "text-gray-400")}>{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="text-xs text-gray-500">Notes</p>
          <p className={cn("mt-0.5 text-sm whitespace-pre-wrap", review.notes ? "text-gray-700" : "text-gray-400")}>{review.notes || "No notes"}</p>
        </div>
      </div>
    </div>
  );
}

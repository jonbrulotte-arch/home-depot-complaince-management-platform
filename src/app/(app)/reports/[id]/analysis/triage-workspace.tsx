"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import type { Disposition, TeamInfluence } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DISPOSITIONS, DispositionBadge } from "@/components/shared/status-badges";
import { apiFetch } from "@/lib/client-api";
import { TEAM_INFLUENCES } from "@/lib/line-fields";
import { cn, formatCurrency, formatUtcDateTime } from "@/lib/utils";

export interface TriageReview {
  disposition: Disposition;
  teamInfluence: TeamInfluence | null;
  reasonCodeId: string | null;
  rootCause: string | null;
  notes: string | null;
  extraFields: Record<string, string>;
}

export interface TriageLine {
  id: string;
  programName: string;
  metricId: string;
  metricName: string;
  poNumber: string | null;
  offset: number;
  sourceSheet: string;
  sourceRow: number;
  fields: { key: string; label: string; kind: "text" | "date" | "number" | "bool"; value: string | number | boolean }[];
  raw: Record<string, string | number | boolean | null>;
  review: TriageReview | null;
}

interface ReasonCode {
  id: string;
  metricId: string;
  code: string;
  whenToUse: string | null;
  requiredDocs: string | null;
  docDetails: string | null;
}

interface HistoryItem {
  poNumber: string;
  fiscalMonth: number;
  label: string;
  offset: number;
  disposition: Disposition | null;
}

const NONE = "__none__";
const DISPOSITION_ORDER: Disposition[] = ["ACCEPTED", "DISPUTABLE", "NOT_DISPUTABLE", "NEEDS_RESEARCH", "PENDING"];

function isDone(line: TriageLine) {
  return Boolean(line.review && line.review.disposition !== "PENDING" && line.review.disposition !== "NEEDS_RESEARCH");
}

function formatValue(kind: TriageLine["fields"][number]["kind"], value: string | number | boolean) {
  if (kind === "date") return formatUtcDateTime(String(value));
  if (kind === "bool") return value ? "Yes" : "No";
  return String(value);
}

export function TriageWorkspace({ lines: initial, reasonCodes, history, canEdit }: { lines: TriageLine[]; reasonCodes: ReasonCode[]; history: HistoryItem[]; canEdit: boolean }) {
  const [lines, setLines] = useState(initial);
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; program: string; metric: string; ids: string[] }>();
    for (const l of lines) {
      const g = map.get(l.metricId) ?? { key: l.metricId, program: l.programName, metric: l.metricName, ids: [] };
      g.ids.push(l.id);
      map.set(l.metricId, g);
    }
    return [...map.values()];
  }, [lines]);
  const byId = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? "");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const group = groups.find((g) => g.key === groupKey) ?? groups[0];
  const visible = (group?.ids ?? []).map((id) => byId.get(id)!).filter((l) => !onlyOpen || !isDone(l));
  const [selectedId, setSelectedId] = useState<string | null>(visible[0]?.id ?? null);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  if (!lines.length) {
    return <div className="p-6 text-sm text-gray-500">No non-compliant lines for this period. Import data from the report page first.</div>;
  }

  function selectGroup(key: string) {
    setGroupKey(key);
    const first = groups.find((g) => g.key === key)?.ids.map((id) => byId.get(id)!).find((l) => !onlyOpen || !isDone(l));
    setSelectedId(first?.id ?? null);
  }

  function onSaved(id: string, review: TriageReview, advance: boolean) {
    const updated = lines.map((l) => (l.id === id ? { ...l, review } : l));
    setLines(updated);
    if (!advance || !group) return;
    const ids = group.ids;
    const start = ids.indexOf(id);
    const next = [...ids.slice(start + 1), ...ids.slice(0, start)].find((other) => {
      const line = updated.find((l) => l.id === other)!;
      return !isDone(line);
    });
    if (next) setSelectedId(next);
  }

  const doneCount = lines.filter(isDone).length;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3">
        <div className="mb-3 px-1">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Overall</span>
            <span>{doneCount}/{lines.length}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${(doneCount / lines.length) * 100}%` }} />
          </div>
        </div>
        <nav className="space-y-1">
          {groups.map((g) => {
            const done = g.ids.filter((id) => isDone(byId.get(id)!)).length;
            return (
              <button
                key={g.key}
                onClick={() => selectGroup(g.key)}
                className={cn("w-full rounded-lg px-3 py-2 text-left text-sm transition-colors", g.key === group?.key ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50")}
              >
                <p className="text-xs text-gray-500">{g.program}</p>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{g.metric}</span>
                  <Badge variant={done === g.ids.length ? "success" : "secondary"}>{done}/{g.ids.length}</Badge>
                </div>
              </button>
            );
          })}
        </nav>
        <label className="mt-4 flex items-center gap-2 px-1 text-xs text-gray-600">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          Only lines still open
        </label>
      </aside>

      <div className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
        {visible.length === 0 && <p className="px-4 py-6 text-sm text-gray-400">Every line in this group has a decision.</p>}
        {visible.map((l) => (
          <button
            key={l.id}
            onClick={() => setSelectedId(l.id)}
            className={cn("flex w-full items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50", l.id === selectedId && "bg-blue-50")}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">PO {l.poNumber ?? "—"}</p>
              <p className="text-xs text-gray-500">{formatCurrency(l.offset)} · row {l.sourceRow}</p>
            </div>
            <DispositionBadge disposition={l.review?.disposition} />
          </button>
        ))}
      </div>

      <section className="min-w-0 flex-1 overflow-y-auto p-6">
        {selected ? (
          <LineDetail
            key={selected.id}
            line={selected}
            reasonCodes={reasonCodes.filter((r) => r.metricId === selected.metricId)}
            history={history.filter((h) => h.poNumber === selected.poNumber)}
            canEdit={canEdit}
            onSaved={onSaved}
          />
        ) : (
          <p className="text-sm text-gray-400">Select a line to review.</p>
        )}
      </section>
    </div>
  );
}

function LineDetail({
  line,
  reasonCodes,
  history,
  canEdit,
  onSaved,
}: {
  line: TriageLine;
  reasonCodes: ReasonCode[];
  history: HistoryItem[];
  canEdit: boolean;
  onSaved: (id: string, review: TriageReview, advance: boolean) => void;
}) {
  const [review, setReview] = useState<TriageReview>(
    line.review ?? { disposition: "PENDING", teamInfluence: null, reasonCodeId: null, rootCause: null, notes: null, extraFields: {} },
  );
  const [extras, setExtras] = useState(Object.entries(review.extraFields));
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = reasonCodes.find((r) => r.id === review.reasonCodeId);

  async function save(advance: boolean) {
    setSaving(true);
    setError(null);
    const extraFields = Object.fromEntries(extras.filter(([k]) => k.trim()));
    try {
      await apiFetch(`/api/lines/${line.id}/review`, {
        method: "PUT",
        body: {
          disposition: review.disposition,
          teamInfluence: review.teamInfluence,
          reasonCodeId: review.disposition === "DISPUTABLE" ? review.reasonCodeId : null,
          rootCause: review.rootCause,
          notes: review.notes,
          extraFields,
        },
      });
      onSaved(line.id, { ...review, extraFields }, advance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500">{line.programName} · {line.metricName}</p>
          <h2 className="text-lg font-semibold text-gray-900">PO {line.poNumber ?? "—"}</h2>
          <p className="text-xs text-gray-500">Sheet &quot;{line.sourceSheet}&quot;, row {line.sourceRow}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Pre-dispute offset</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(line.offset)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {line.fields.map((f) => (
            <div key={f.key}>
              <dt className="text-xs text-gray-500">{f.label}</dt>
              <dd className="text-sm text-gray-900 break-words">{formatValue(f.kind, f.value)}</dd>
            </div>
          ))}
        </dl>
        <button onClick={() => setShowRaw(!showRaw)} className="flex w-full items-center gap-2 border-t border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50">
          {showRaw ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          All columns from the export
        </button>
        {showRaw && (
          <table className="min-w-full border-t border-gray-200 text-xs">
            <tbody>
              {Object.entries(line.raw).map(([k, v]) => (
                <tr key={k} className="border-t border-gray-100 first:border-t-0">
                  <td className="w-1/3 px-4 py-1.5 text-gray-500">{k}</td>
                  <td className="px-4 py-1.5 text-gray-900 break-all">{v === null ? "—" : String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {history.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">Other violations on this PO</p>
          <ul className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-gray-700">FM {h.fiscalMonth} · {h.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-900">{formatCurrency(h.offset)}</span>
                  <DispositionBadge disposition={h.disposition} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">Decision</p>
        <div className="flex flex-wrap gap-2">
          {DISPOSITION_ORDER.map((d) => (
            <Button key={d} size="sm" variant={review.disposition === d ? "default" : "outline"} disabled={!canEdit} onClick={() => setReview({ ...review, disposition: d })}>
              {DISPOSITIONS[d].label}
            </Button>
          ))}
        </div>

        {review.disposition === "DISPUTABLE" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Dispute reason code</label>
            {reasonCodes.length ? (
              <Select value={review.reasonCodeId ?? NONE} onValueChange={(v) => setReview({ ...review, reasonCodeId: v === NONE ? null : v })} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not chosen yet</SelectItem>
                  {reasonCodes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-gray-500">This metric has no dispute reason codes configured (Admin › Programs &amp; Rules).</p>
            )}
            {reason && (
              <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-1">
                {reason.whenToUse && <p><span className="font-semibold">When to use:</span> {reason.whenToUse}</p>}
                {reason.requiredDocs && <p><span className="font-semibold">Required documents:</span> {reason.requiredDocs}</p>}
                {reason.docDetails && <p><span className="font-semibold">Documents must show:</span> {reason.docDetails}</p>}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Team influence</label>
            <Select value={review.teamInfluence ?? NONE} onValueChange={(v) => setReview({ ...review, teamInfluence: v === NONE ? null : (v as TeamInfluence) })} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {Object.entries(TEAM_INFLUENCES).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Root cause <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input value={review.rootCause ?? ""} onChange={(e) => setReview({ ...review, rootCause: e.target.value })} disabled={!canEdit} placeholder="e.g. Missed 48-hour RTS window" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
          <Textarea rows={4} value={review.notes ?? ""} onChange={(e) => setReview({ ...review, notes: e.target.value })} disabled={!canEdit} placeholder="Research, observations, follow-ups…" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Additional research inputs <span className="text-gray-400 font-normal">(e.g. WMS waved date, POD received)</span>
          </label>
          <div className="space-y-2">
            {extras.map(([k, v], i) => (
              <div key={i} className="flex gap-2">
                <Input value={k} placeholder="Field" disabled={!canEdit} onChange={(e) => setExtras(extras.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} className="w-1/3" />
                <Input value={v} placeholder="Value" disabled={!canEdit} onChange={(e) => setExtras(extras.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                {canEdit && (
                  <button onClick={() => setExtras(extras.filter((_, j) => j !== i))} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Remove">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => setExtras([...extras, ["", ""]])}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add input
              </Button>
            )}
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            <Button onClick={() => save(true)} disabled={saving}>{saving ? "Saving…" : "Save & next"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

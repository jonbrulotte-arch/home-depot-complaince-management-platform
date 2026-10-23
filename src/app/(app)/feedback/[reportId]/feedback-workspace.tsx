"use client";

import { useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import type { FeedbackItem } from "@/lib/feedback";
import type { ScorecardViolation } from "@/lib/scorecard";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

type Violation = ScorecardViolation & { lineId: string };

const ALL = "__all__";
const NO_TEAM = "Not assigned";

export function FeedbackWorkspace({
  reportId,
  violations,
  initialFeedback,
  currentUserId,
  canSubmit,
  canDeleteAny,
}: {
  reportId: string;
  violations: Violation[];
  initialFeedback: FeedbackItem[];
  currentUserId: string;
  canSubmit: boolean;
  canDeleteAny: boolean;
}) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [program, setProgram] = useState(ALL);
  const [team, setTeam] = useState(ALL);
  const [onlyOpen, setOnlyOpen] = useState(false);

  const programs = [...new Set(violations.map((v) => v.program))];
  const teams = [...new Set(violations.map((v) => v.teamInfluence ?? NO_TEAM))].sort();
  const byLine = (lineId: string) => feedback.filter((f) => f.lineId === lineId);
  const shown = violations.filter(
    (v) =>
      (program === ALL || v.program === program) &&
      (team === ALL || (v.teamInfluence ?? NO_TEAM) === team) &&
      (!onlyOpen || byLine(v.lineId).length === 0),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-60">
          <Select value={program} onValueChange={setProgram}>
            <SelectTrigger aria-label="Program">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All programs</SelectItem>
              {programs.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger aria-label="Team influence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Only violations without feedback
        </label>
        <span className="ml-auto text-sm text-gray-500">
          {shown.length} of {violations.length} violation(s)
        </span>
      </div>

      {shown.length === 0 && <p className="text-sm text-gray-400">No violations match these filters.</p>}
      {shown.map((v) => (
        <ViolationFeedback
          key={v.lineId}
          reportId={reportId}
          violation={v}
          items={byLine(v.lineId)}
          currentUserId={currentUserId}
          canSubmit={canSubmit}
          canDeleteAny={canDeleteAny}
          onAdded={(item) => setFeedback((all) => [...all, item])}
          onDeleted={(id) => setFeedback((all) => all.filter((f) => f.id !== id))}
        />
      ))}
    </div>
  );
}

function ViolationFeedback({
  reportId,
  violation: v,
  items,
  currentUserId,
  canSubmit,
  canDeleteAny,
  onAdded,
  onDeleted,
}: {
  reportId: string;
  violation: Violation;
  items: FeedbackItem[];
  currentUserId: string;
  canSubmit: boolean;
  canDeleteAny: boolean;
  onAdded: (item: FeedbackItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      onAdded(await apiFetch<FeedbackItem>("/api/feedback", { body: { reportId, lineId: v.lineId, body: draft } }));
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/feedback/${id}`, { method: "DELETE" });
      onDeleted(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const details: [string, string][] = [
    ["Site", v.dcNumber ?? "—"],
    ["Offset", formatCurrency(v.offset)],
    ["Team", v.teamInfluence ?? "Not assigned"],
    ["Dispute", v.disputeStatus ? DISPUTE_STATUS_LABELS[v.disputeStatus] : "Not disputed"],
  ];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">
            {v.program} · {v.metric}
          </p>
          <p className="font-medium text-gray-900">PO {v.poNumber ?? "—"}</p>
        </div>
        {items.length > 0 ? (
          <Badge variant="default">
            <MessageSquare className="h-3 w-3 mr-1" />
            {items.length}
          </Badge>
        ) : (
          <Badge variant="secondary">No feedback yet</Badge>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="text-sm text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
      {(v.rootCause || v.notes) && (
        <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p className="text-xs text-gray-500">Root cause / Notes from the compliance team</p>
          {v.rootCause && <p className="font-medium text-gray-800">{v.rootCause}</p>}
          {v.notes && <p className="whitespace-pre-wrap">{v.notes}</p>}
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-2 border-t border-gray-200 pt-3">
          {items.map((f) => (
            <li key={f.id} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{f.author ?? "Former user"}</span> · {formatDateTime(f.createdAt)}
                </p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{f.body}</p>
              </div>
              {canSubmit && (f.authorId === currentUserId || canDeleteAny) && (
                <button onClick={() => remove(f.id)} className="text-gray-400 hover:text-red-600" title="Delete this feedback" aria-label="Delete feedback">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canSubmit && (
        <div className={cn("space-y-2", items.length === 0 && "border-t border-gray-200 pt-3")}>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Context for this violation: what happened, what was done, what would prevent it…"
            rows={2}
            aria-label={`Feedback for PO ${v.poNumber ?? ""}`}
          />
          <div className="flex items-center justify-end gap-3">
            {error && <span className="text-xs text-red-700">{error}</span>}
            <Button size="sm" onClick={add} disabled={busy || !draft.trim()}>
              {busy ? "Saving…" : "Add feedback"}
            </Button>
          </div>
        </div>
      )}
      {!canSubmit && error && <p className="text-xs text-red-700">{error}</p>}
    </Card>
  );
}

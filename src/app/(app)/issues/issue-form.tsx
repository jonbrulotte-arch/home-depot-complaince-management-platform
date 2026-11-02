"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES, ISSUE_STATUSES, MAX_ISSUE_POS, normalizePoNumber, parsePoList, type IssueSeverityKey, type IssueStatusKey } from "@/lib/issues";
import { RETIRED_TEAM_INFLUENCES, TEAM_INFLUENCES } from "@/lib/line-fields";

const NONE = "none";

export interface IssueFormValues {
  title: string;
  issueDate: string;
  status: IssueStatusKey;
  severity: IssueSeverityKey;
  category: string;
  programId: string | null;
  team: string | null;
  hdTicket: string;
  description: string;
  actionsTaken: string;
  consequences: string;
  peopleInvolved: string;
  references: string;
  resolution: string;
  followUpDate: string;
  pos: { poNumber: string; poCreateDate: string }[];
}

function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {hint && <span className="font-normal text-gray-400"> {hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** Logs a new issue or edits one: what happened, the POs involved, and what was done about it. */
export function IssueForm({ issueId, initial, programs }: { issueId?: string; initial: IssueFormValues; programs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState<IssueFormValues>(initial);
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof IssueFormValues>(key: K, value: IssueFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const setPo = (i: number, patch: Partial<IssueFormValues["pos"][number]>) => set("pos", v.pos.map((p, n) => (n === i ? { ...p, ...patch } : p)));

  function addPasted() {
    const { pos, invalid } = parsePoList(paste);
    const have = new Set(v.pos.map((p) => normalizePoNumber(p.poNumber)));
    const added = pos.filter((po) => !have.has(po));
    set("pos", [...v.pos.filter((p) => p.poNumber.trim()), ...added.map((poNumber) => ({ poNumber, poCreateDate: "" }))].slice(0, MAX_ISSUE_POS));
    setPaste("");
    setPasteNote(
      [added.length ? `Added ${added.length} PO(s).` : "No new POs.", invalid.length ? `Not PO numbers: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}` : ""].filter(Boolean).join(" "),
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      ...v,
      programId: v.programId,
      team: v.team,
      followUpDate: v.followUpDate || null,
      pos: v.pos.filter((p) => p.poNumber.trim()).map((p) => ({ poNumber: p.poNumber, poCreateDate: p.poCreateDate || null })),
    };
    try {
      if (issueId) {
        await apiFetch(`/api/issues/${issueId}`, { method: "PATCH", body });
        router.push(`/issues/${issueId}`);
      } else {
        const created = await apiFetch<{ id: string }>("/api/issues", { body });
        router.push(`/issues/${created.id}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the issue");
      setBusy(false);
    }
  }

  const teams = Object.entries(TEAM_INFLUENCES).filter(([k]) => !RETIRED_TEAM_INFLUENCES.includes(k) || k === initial.team);
  const valid = v.title.trim() && v.description.trim() && v.issueDate;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>The issue</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Field label="Title" htmlFor="issue-title" className="md:col-span-3">
            <Input id="issue-title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Carrier missed the 09/16 pickup at Site 3" maxLength={200} />
          </Field>
          <Field label="Date of the issue" htmlFor="issue-date">
            <Input id="issue-date" type="date" value={v.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={v.status} onValueChange={(s) => set("status", s as IssueStatusKey)}>
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ISSUE_STATUSES).map(([k, s]) => (
                  <SelectItem key={k} value={k}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Severity">
            <Select value={v.severity} onValueChange={(s) => set("severity", s as IssueSeverityKey)}>
              <SelectTrigger aria-label="Severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ISSUE_SEVERITIES).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={v.category} onValueChange={(c) => set("category", c)}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="HD Support ticket #" htmlFor="issue-ticket">
            <Input id="issue-ticket" value={v.hdTicket} onChange={(e) => set("hdTicket", e.target.value)} placeholder="Ticket number" maxLength={60} />
          </Field>
          <Field label="THD program" hint="(optional)">
            <Select value={v.programId ?? NONE} onValueChange={(p) => set("programId", p === NONE ? null : p)}>
              <SelectTrigger aria-label="THD program">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Team responsible" hint="(optional)">
            <Select value={v.team ?? NONE} onValueChange={(t) => set("team", t === NONE ? null : t)}>
              <SelectTrigger aria-label="Team responsible">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {teams.map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Follow-up date" hint="(optional)" htmlFor="issue-followup">
            <Input id="issue-followup" type="date" value={v.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>POs</CardTitle>
          <p className="text-sm text-gray-500">
            The POs the issue affected. They link to the compliance data as soon as THD&apos;s exports for them are imported. Add the PO create date only when the PO number has been used more than once; otherwise the use created on or before the issue date is linked.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {v.pos.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input value={p.poNumber} onChange={(e) => setPo(i, { poNumber: e.target.value })} placeholder="PO #" aria-label={`PO ${i + 1}`} className="w-48" />
              <Input type="date" value={p.poCreateDate} onChange={(e) => setPo(i, { poCreateDate: e.target.value })} aria-label={`PO ${i + 1} create date`} className="w-44" />
              <Button variant="ghost" size="sm" onClick={() => set("pos", v.pos.filter((_, n) => n !== i))} aria-label={`Remove PO ${i + 1}`}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => set("pos", [...v.pos, { poNumber: "", poCreateDate: "" }])} disabled={v.pos.length >= MAX_ISSUE_POS}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add PO
          </Button>
          <div className="space-y-2 border-t border-gray-200 pt-3">
            <label htmlFor="issue-paste" className="block text-sm font-medium text-gray-700">
              Paste a list of POs <span className="font-normal text-gray-400">(one per line, or separated by commas or spaces)</span>
            </label>
            <Textarea id="issue-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={"98963592\n98992706, 99685624"} />
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={addPasted} disabled={!paste.trim()}>
                Add these POs
              </Button>
              {pasteNote && <span className="text-xs text-gray-500">{pasteNote}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="What happened" htmlFor="issue-description" className="md:col-span-2">
            <Textarea id="issue-description" value={v.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="The facts: what went wrong, where and when." />
          </Field>
          <Field label="Actions taken" htmlFor="issue-actions">
            <Textarea id="issue-actions" value={v.actionsTaken} onChange={(e) => set("actionsTaken", e.target.value)} rows={4} placeholder="What was done about it, by whom, when." />
          </Field>
          <Field label="Consequences" htmlFor="issue-consequences">
            <Textarea id="issue-consequences" value={v.consequences} onChange={(e) => set("consequences", e.target.value)} rows={4} placeholder="Late shipment, short fill, cancelled order, expected chargeback…" />
          </Field>
          <Field label="People involved" htmlFor="issue-people">
            <Textarea id="issue-people" value={v.peopleInvolved} onChange={(e) => set("peopleInvolved", e.target.value)} rows={3} placeholder="Our team, THD contacts, carrier contacts." />
          </Field>
          <Field label="References" hint="(BOL, PRO, customer order, tracking #…)" htmlFor="issue-references">
            <Textarea id="issue-references" value={v.references} onChange={(e) => set("references", e.target.value)} rows={3} />
          </Field>
          <Field label="Resolution" hint="(when resolved)" htmlFor="issue-resolution" className="md:col-span-2">
            <Textarea id="issue-resolution" value={v.resolution} onChange={(e) => set("resolution", e.target.value)} rows={3} placeholder="How it ended and what will prevent it." />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-sm text-red-700">{error}</span>}
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !valid}>
          {busy ? "Saving…" : issueId ? "Save changes" : "Log issue"}
        </Button>
      </div>
    </div>
  );
}
